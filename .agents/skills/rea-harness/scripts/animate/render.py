#!/usr/bin/env python3
"""Render a REA evidence bundle into Manim animations.

Usage: python render.py --bundle path/to/evidence.json --out outdir/
"""
import argparse
import json
import shutil
import sys
from pathlib import Path

from manim import DOWN, FadeIn, GREY, ORANGE, Scene, Text, WHITE, config

from scenes.component import Component
from scenes.process_flow import ProcessFlow


class EmptyState(Scene):
    @classmethod
    def constructor(cls, target):
        scene = cls()
        scene.target = target or {}
        return scene

    def construct(self):
        t = self.target
        title = Text(f"target: {t.get('kind', 'unknown')}", color=WHITE).scale(0.8)
        source = t.get("source", "")
        if source:
            sub = Text(source, color=GREY, width=13).scale(0.4)
            sub.next_to(title, DOWN, buff=0.4)
        note = Text("no systems inferred", color=ORANGE).scale(0.7)
        if source:
            note.next_to(sub, DOWN, buff=0.6)
        else:
            note.next_to(title, DOWN, buff=0.6)
        self.play(FadeIn(title))
        if source:
            self.play(FadeIn(sub))
        self.play(FadeIn(note))
        self.wait(1)


def render_one(scene_cls, scene_args, out_path, fmt):
    config.quality = "low_quality"
    config.disable_caching = True
    config.output_file = str(out_path)
    if fmt == "png":
        config.save_last_frame = True
    else:
        config.format = "mp4"
        config.save_last_frame = False
    scene_cls.constructor(*scene_args).render()


def main():
    parser = argparse.ArgumentParser(description="Render a REA evidence bundle into animations.")
    parser.add_argument("--bundle", required=True, help="path to evidence bundle JSON")
    parser.add_argument("--out", required=True, help="output directory")
    args = parser.parse_args()

    bundle_path = Path(args.bundle)
    try:
        bundle = json.loads(bundle_path.read_text())
    except (OSError, json.JSONDecodeError) as e:
        print(f"error: cannot read bundle {bundle_path}: {e}", file=sys.stderr)
        return 2
    if not isinstance(bundle, dict):
        print(f"error: bundle {bundle_path} is not a JSON object", file=sys.stderr)
        return 2

    outdir = Path(args.out)
    outdir.mkdir(parents=True, exist_ok=True)
    config.media_dir = str(outdir / ".media")

    fmt = "mp4" if shutil.which("ffmpeg") else "png"
    if fmt == "png":
        print("note: ffmpeg not found; rendering still frames (.png) instead of video")

    systems = bundle.get("systems") or []
    flows = bundle.get("flows") or {}
    target = bundle.get("target") or {}

    outputs = []
    if not systems:
        print("note: bundle has no systems; rendering generic empty-state scene")
        out_path = outdir / "no_systems"
        render_one(EmptyState, (target,), out_path, fmt)
        outputs.append(out_path.with_suffix("." + fmt))
    else:
        for system in systems:
            sid = system.get("id") or "unnamed"
            out_path = outdir / f"component_{sid}"
            render_one(Component, (system,), out_path, fmt)
            outputs.append(out_path.with_suffix("." + fmt))
        out_path = outdir / "process_flow"
        render_one(ProcessFlow, (systems, flows), out_path, fmt)
        outputs.append(out_path.with_suffix("." + fmt))

    print("outputs:")
    for path in outputs:
        size = path.stat().st_size if path.exists() else 0
        print(f"  {path} ({size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
