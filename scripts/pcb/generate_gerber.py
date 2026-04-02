#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from pathlib import Path

from exporter import export_gerber_bundle


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
    export_gerber_bundle(pcb_data, output_dir, args.silk_stroke_mm)


if __name__ == "__main__":
    main()
