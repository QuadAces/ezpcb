#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

import shapely.geometry as sg

from pcbflow import Board
from pcbflow.excellon import excellon
from pcbflow.hershey import text as hershey_text

DEFAULT_SILK_STROKE_MM = 0.06
MIN_SILK_STROKE_MM = 0.04
MAX_SILK_STROKE_MM = 0.20
DEFAULT_COMPONENT_MARKER_MM = 0.4
DEFAULT_COMPONENT_DRILL_MM = 0.3


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def to_board_local(x: float, y: float, origin_x: float, origin_y: float) -> tuple[float, float]:
    return (x - origin_x, y - origin_y)


def add_hole(drills: dict[float, list[tuple[float, float]]], diameter: float, xy: tuple[float, float]) -> None:
    safe_dia = round(max(0.05, diameter), 3)
    if safe_dia not in drills:
        drills[safe_dia] = []
    drills[safe_dia].append(xy)


def text_scale_for_height_mm(size_mm: float) -> float:
    # Calibrate pcbflow Hershey scale to approximate the requested text height in mm.
    sample = hershey_text(0.0, 0.0, "H", scale=1.0, side="top", linewidth=DEFAULT_SILK_STROKE_MM)
    sample_h = max(0.01, float(sample.bounds[3] - sample.bounds[1]))
    return size_mm / sample_h


def generate_gerber(
    pcb_data: dict, output_dir: Path, silk_stroke_mm: float | None = None
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    board_data = pcb_data.get("board", {})
    width = max(1.0, float(board_data.get("width", 100.0)))
    height = max(1.0, float(board_data.get("height", 80.0)))
    origin = board_data.get("origin", {})
    origin_x = float(origin.get("x", 0.0))
    origin_y = float(origin.get("y", 0.0))

    board = Board((width, height))
    board.add_outline()

    resolved_silk_stroke_mm = (
        DEFAULT_SILK_STROKE_MM
        if silk_stroke_mm is None
        else clamp(silk_stroke_mm, MIN_SILK_STROKE_MM, MAX_SILK_STROKE_MM)
    )
    board.drc.text_silk_width = resolved_silk_stroke_mm
    board.drc.silk_width = resolved_silk_stroke_mm

    drills: dict[float, list[tuple[float, float]]] = {}

    components = pcb_data.get("components", [])
    for component in components:
        x = float(component.get("position", {}).get("x", 0.0))
        y = float(component.get("position", {}).get("y", 0.0))
        layer = "GBL" if component.get("layer", "top") == "bottom" else "GTL"
        local_xy = to_board_local(x, y, origin_x, origin_y)

        marker = sg.Point(local_xy).buffer(DEFAULT_COMPONENT_MARKER_MM / 2.0)
        board.layers[layer].add(marker)
        add_hole(drills, DEFAULT_COMPONENT_DRILL_MM, local_xy)

    traces = pcb_data.get("traces", [])
    for trace in traces:
        layer = "GBL" if trace.get("layer", "top") == "bottom" else "GTL"
        width_mm = max(0.05, float(trace.get("widthMm", 0.25)))
        net_name = trace.get("netId")

        raw_points = trace.get("points", [])
        points = [
            to_board_local(float(point.get("x", 0.0)), float(point.get("y", 0.0)), origin_x, origin_y)
            for point in raw_points
        ]
        if len(points) >= 2:
            poly = sg.LineString(points).buffer(width_mm / 2.0)
            board.layers[layer].add(poly, net_name)

        for via in trace.get("vias", []):
            vx = float(via.get("x", 0.0))
            vy = float(via.get("y", 0.0))
            local_xy = to_board_local(vx, vy, origin_x, origin_y)
            pad_mm = max(0.1, float(via.get("padMm", 0.6)))
            drill_mm = max(0.05, float(via.get("drillMm", 0.3)))

            via_pad = sg.Point(local_xy).buffer(pad_mm / 2.0)
            board.layers["GTL"].add(via_pad, net_name)
            board.layers["GBL"].add(via_pad, net_name)
            add_hole(drills, drill_mm, local_xy)

    texts = pcb_data.get("texts", [])
    for text_item in texts:
        raw_text = str(text_item.get("text", "")).strip()
        if not raw_text:
            continue

        x = float(text_item.get("position", {}).get("x", 0.0))
        y = float(text_item.get("position", {}).get("y", 0.0))
        size_mm = max(0.8, float(text_item.get("sizeMm", 1.6)))
        angle = float(text_item.get("rotation", 0.0))
        side = "bottom" if text_item.get("layer", "top") == "bottom" else "top"

        board.add_text(
            to_board_local(x, y, origin_x, origin_y),
            raw_text,
            scale=text_scale_for_height_mm(size_mm),
            angle=angle,
            side=side,
            justify="centre",
        )

    with (output_dir / "top_copper.gbr").open("w", encoding="utf-8") as f:
        board.layers["GTL"].save(f)

    with (output_dir / "bottom_copper.gbr").open("w", encoding="utf-8") as f:
        board.layers["GBL"].save(f)

    with (output_dir / "silkscreen_top.gbr").open("w", encoding="utf-8") as f:
        board.layers["GTO"].save(f)

    with (output_dir / "silkscreen_bottom.gbr").open("w", encoding="utf-8") as f:
        board.layers["GBO"].save(f)

    with (output_dir / "edge_cuts.gbr").open("w", encoding="utf-8") as f:
        board.layers["GML"].save(f)

    with (output_dir / "drill.drl").open("w", encoding="utf-8") as f:
        if drills:
            excellon(f, drills, "Plated,1,2,PTH")
        else:
            f.write("M48\nMETRIC,TZ\n%\nM30\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Gerber artifacts from flattened PCB JSON")
    parser.add_argument("--input", required=True, help="Input PCB JSON path")
    parser.add_argument("--output", required=True, help="Output directory")
    parser.add_argument(
        "--silk-stroke-mm",
        type=float,
        default=None,
        help="Silkscreen text stroke width in mm (clamped to 0.04-0.20)",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_dir = Path(args.output)

    pcb_data = json.loads(input_path.read_text(encoding="utf-8"))
    generate_gerber(pcb_data, output_dir, args.silk_stroke_mm)


if __name__ == "__main__":
    main()
