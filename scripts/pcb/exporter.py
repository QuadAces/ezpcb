from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import shapely.geometry as sg
from shapely.geometry.base import BaseGeometry

from pcbflow import Board
from pcbflow.excellon import excellon
from pcbflow.hershey import text as hershey_text

DEFAULT_SILK_STROKE_MM = 0.06
MIN_SILK_STROKE_MM = 0.04
MAX_SILK_STROKE_MM = 0.20
DEFAULT_TRACE_WIDTH_MM = 0.25
DEFAULT_VIA_PAD_MM = 0.6
DEFAULT_VIA_DRILL_MM = 0.3
MIN_DRILL_MM = 0.05
MIN_PAD_MM = 0.1


def distribute_pins_across_sides(
    count: int, body_width: float, body_height: float
) -> dict[str, int]:
    if count <= 1:
        return {"left": 0, "right": 1, "top": 0, "bottom": 0}

    if count == 2:
        return {"left": 1, "right": 1, "top": 0, "bottom": 0}

    if count == 3:
        return {"left": 1, "right": 1, "top": 1, "bottom": 0}

    side_order = ["top", "right", "bottom", "left"]
    side_lengths = {
        "top": body_width,
        "bottom": body_width,
        "left": body_height,
        "right": body_height,
    }
    total_length = sum(side_lengths.values())

    base = {
        side: int((count * side_lengths[side]) // total_length)
        for side in side_order
    }

    if count >= 4:
        for side in side_order:
            if base[side] == 0:
                base[side] = 1

    assigned = base["top"] + base["right"] + base["bottom"] + base["left"]
    remaining = count - assigned

    ranking = sorted(
        (
            {
                "side": side,
                "frac": (count * side_lengths[side] / total_length)
                - int(count * side_lengths[side] / total_length),
            }
            for side in side_order
        ),
        key=lambda item: item["frac"],
        reverse=True,
    )

    rank_index = 0
    while remaining > 0:
        side = ranking[rank_index % len(ranking)]["side"]
        base[side] += 1
        remaining -= 1
        rank_index += 1

    while remaining < 0:
        candidates = [side for side in side_order if base[side] > 1]
        if not candidates:
            break
        side = candidates[rank_index % len(candidates)]
        base[side] -= 1
        remaining += 1
        rank_index += 1

    return {
        "left": base["left"],
        "right": base["right"],
        "top": base["top"],
        "bottom": base["bottom"],
    }


def create_pad_anchors(
    pin_ids: list[str], body_width: float, body_height: float
) -> list[dict[str, Any]]:
    counts = distribute_pins_across_sides(len(pin_ids), body_width, body_height)
    sides: list[str] = []

    sides.extend(["top"] * counts["top"])
    sides.extend(["right"] * counts["right"])
    sides.extend(["bottom"] * counts["bottom"])
    sides.extend(["left"] * counts["left"])

    if not sides:
        sides = ["right"]

    by_side: dict[str, list[str]] = {
        "top": [],
        "right": [],
        "bottom": [],
        "left": [],
    }

    for index, pin_id in enumerate(pin_ids):
        side = sides[index % len(sides)]
        by_side[side].append(pin_id)

    anchors: list[dict[str, Any]] = []
    for side in ("top", "right", "bottom", "left"):
        side_pins = by_side[side]
        for index, pin_id in enumerate(side_pins):
            t = (index + 1) / (len(side_pins) + 1)
            x = 0.0 if side == "left" else body_width if side == "right" else t * body_width
            y = 0.0 if side == "top" else body_height if side == "bottom" else t * body_height
            anchors.append({"id": pin_id, "side": side, "x": x, "y": y})

    return anchors


def component_pad_diameter_mm(body_width: float, body_height: float) -> float:
    base = min(body_width, body_height) * 0.24
    return clamp(base, 0.35, 1.2)


@dataclass(frozen=True)
class BoardSpec:
    width_mm: float
    height_mm: float
    origin_x_mm: float
    origin_y_mm: float


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def safe_float(value: Any, fallback: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def resolve_board_spec(pcb_data: dict[str, Any]) -> BoardSpec:
    board_data = pcb_data.get("board") or {}
    origin = board_data.get("origin") or {}

    width_mm = max(1.0, safe_float(board_data.get("width"), 100.0))
    height_mm = max(1.0, safe_float(board_data.get("height"), 80.0))

    return BoardSpec(
        width_mm=width_mm,
        height_mm=height_mm,
        origin_x_mm=safe_float(origin.get("x"), 0.0),
        origin_y_mm=safe_float(origin.get("y"), 0.0),
    )


def to_board_local(
    x_mm: float, y_mm: float, board: BoardSpec
) -> tuple[float, float]:
    return (x_mm - board.origin_x_mm, y_mm - board.origin_y_mm)


def text_scale_for_height_mm(size_mm: float) -> float:
    sample = hershey_text(
        0.0, 0.0, "H", scale=1.0, side="top", linewidth=DEFAULT_SILK_STROKE_MM
    )
    sample_height = max(0.01, float(sample.bounds[3] - sample.bounds[1]))
    return size_mm / sample_height


def add_hole(
    drills: dict[float, list[tuple[float, float]]], diameter_mm: float, xy: tuple[float, float]
) -> None:
    safe_diameter = round(max(MIN_DRILL_MM, diameter_mm), 3)
    drills.setdefault(safe_diameter, []).append(xy)


def add_geometry(
    board: Board, layer: str, geometry: BaseGeometry, net_name: str | None = None
) -> None:
    if geometry.is_empty:
        return
    board.layers[layer].add(geometry, net_name)


def buffered_point(x_mm: float, y_mm: float, diameter_mm: float) -> sg.Polygon:
    return sg.Point((x_mm, y_mm)).buffer(max(MIN_PAD_MM, diameter_mm) / 2.0)


def buffered_trace(points: list[tuple[float, float]], width_mm: float) -> sg.Polygon | None:
    if len(points) < 2:
        return None

    return sg.LineString(points).buffer(
        max(0.05, width_mm) / 2.0, cap_style=1, join_style=1
    )


class GerberExporter:
    def __init__(self, pcb_data: dict[str, Any], output_dir: Path, silk_stroke_mm: float | None) -> None:
        self.pcb_data = pcb_data
        self.output_dir = output_dir
        self.board = resolve_board_spec(pcb_data)
        self.silk_stroke_mm = (
            DEFAULT_SILK_STROKE_MM
            if silk_stroke_mm is None
            else clamp(silk_stroke_mm, MIN_SILK_STROKE_MM, MAX_SILK_STROKE_MM)
        )

    def export(self) -> None:
        self.output_dir.mkdir(parents=True, exist_ok=True)

        board = Board((self.board.width_mm, self.board.height_mm))
        board.add_outline()
        board.drc.text_silk_width = self.silk_stroke_mm
        board.drc.silk_width = self.silk_stroke_mm

        drills: dict[float, list[tuple[float, float]]] = {}
        self._export_components(board, drills)
        self._export_traces(board, drills)
        self._export_text(board)
        self._write_layers(board)
        self._write_drills(drills)

    def _export_components(
        self, board: Board, drills: dict[float, list[tuple[float, float]]]
    ) -> None:
        for component in self.pcb_data.get("components", []):
            x_mm = safe_float(component.get("position", {}).get("x"), 0.0)
            y_mm = safe_float(component.get("position", {}).get("y"), 0.0)
            layer = "GBL" if component.get("layer", "top") == "bottom" else "GTL"
            bounds = component.get("bounds", {})
            body_width = max(0.1, safe_float(bounds.get("width"), 2.0))
            body_height = max(0.1, safe_float(bounds.get("height"), 1.25))

            pins = component.get("pins", [])
            pin_ids = [str(pin.get("id", "")) for pin in pins if str(pin.get("id", ""))]
            if not pin_ids:
                pin_ids = ["1"]

            net_by_pin = {
                str(pin.get("id", "")): pin.get("netId")
                for pin in pins
                if str(pin.get("id", ""))
            }

            anchors = create_pad_anchors(pin_ids, body_width, body_height)
            pad_diameter = component_pad_diameter_mm(body_width, body_height)

            for anchor in anchors:
                pin_x = x_mm + (safe_float(anchor.get("x"), 0.0) - body_width / 2)
                pin_y = y_mm + (safe_float(anchor.get("y"), 0.0) - body_height / 2)
                local_xy = to_board_local(pin_x, pin_y, self.board)
                net_name = net_by_pin.get(str(anchor.get("id", "")))
                add_geometry(board, layer, buffered_point(*local_xy, pad_diameter), net_name)

    def _export_traces(
        self, board: Board, drills: dict[float, list[tuple[float, float]]]
    ) -> None:
        for trace in self.pcb_data.get("traces", []):
            layer = "GBL" if trace.get("layer", "top") == "bottom" else "GTL"
            width_mm = max(0.05, safe_float(trace.get("widthMm"), DEFAULT_TRACE_WIDTH_MM))
            net_name = trace.get("netId")

            points = [
                to_board_local(
                    safe_float(point.get("x"), 0.0),
                    safe_float(point.get("y"), 0.0),
                    self.board,
                )
                for point in trace.get("points", [])
            ]
            geometry = buffered_trace(points, width_mm)
            if geometry is not None:
                add_geometry(board, layer, geometry, net_name)

            for via in trace.get("vias", []):
                local_xy = to_board_local(
                    safe_float(via.get("x"), 0.0),
                    safe_float(via.get("y"), 0.0),
                    self.board,
                )
                pad_mm = max(MIN_PAD_MM, safe_float(via.get("padMm"), DEFAULT_VIA_PAD_MM))
                drill_mm = max(
                    MIN_DRILL_MM, safe_float(via.get("drillMm"), DEFAULT_VIA_DRILL_MM)
                )

                via_pad = buffered_point(*local_xy, pad_mm)
                add_geometry(board, "GTL", via_pad, net_name)
                add_geometry(board, "GBL", via_pad, net_name)
                add_hole(drills, drill_mm, local_xy)

    def _export_text(self, board: Board) -> None:
        for text_item in self.pcb_data.get("texts", []):
            raw_text = str(text_item.get("text", "")).strip()
            if not raw_text:
                continue

            x_mm = safe_float(text_item.get("position", {}).get("x"), 0.0)
            y_mm = safe_float(text_item.get("position", {}).get("y"), 0.0)
            size_mm = max(0.8, safe_float(text_item.get("sizeMm"), 1.6))
            angle = safe_float(text_item.get("rotation"), 0.0)
            side = "bottom" if text_item.get("layer", "top") == "bottom" else "top"

            board.add_text(
                to_board_local(x_mm, y_mm, self.board),
                raw_text,
                scale=text_scale_for_height_mm(size_mm),
                angle=angle,
                side=side,
                justify="centre",
            )

    def _write_layers(self, board: Board) -> None:
        with (self.output_dir / "top_copper.gbr").open("w", encoding="utf-8") as file_handle:
            board.layers["GTL"].save(file_handle)

        with (self.output_dir / "bottom_copper.gbr").open("w", encoding="utf-8") as file_handle:
            board.layers["GBL"].save(file_handle)

        with (self.output_dir / "silkscreen_top.gbr").open("w", encoding="utf-8") as file_handle:
            board.layers["GTO"].save(file_handle)

        with (self.output_dir / "silkscreen_bottom.gbr").open("w", encoding="utf-8") as file_handle:
            board.layers["GBO"].save(file_handle)

        with (self.output_dir / "edge_cuts.gbr").open("w", encoding="utf-8") as file_handle:
            board.layers["GML"].save(file_handle)

    def _write_drills(self, drills: dict[float, list[tuple[float, float]]]) -> None:
        with (self.output_dir / "drill.drl").open("w", encoding="utf-8") as file_handle:
            if drills:
                excellon(file_handle, drills, "Plated,1,2,PTH")
            else:
                file_handle.write("M48\nMETRIC,TZ\n%\nM30\n")


def export_gerber_bundle(
    pcb_data: dict[str, Any], output_dir: Path, silk_stroke_mm: float | None = None
) -> None:
    GerberExporter(pcb_data, output_dir, silk_stroke_mm).export()
