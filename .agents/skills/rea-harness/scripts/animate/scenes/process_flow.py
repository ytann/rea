from math import ceil

from manim import (
    Arrow,
    Create,
    GREY,
    RoundedRectangle,
    Scene,
    Text,
    WHITE,
    Write,
)

from scenes.component import EVIDENCE_COLORS


class ProcessFlow(Scene):
    @classmethod
    def constructor(cls, systems, flows=None):
        scene = cls()
        scene.systems = systems or []
        scene.flows = flows or {}
        return scene

    def construct(self):
        systems = self.systems
        n = len(systems)
        if n == 0:
            return

        nodes = {}
        for i, s in enumerate(systems):
            sid = s.get("id", str(i))
            color = EVIDENCE_COLORS.get(s.get("evidence_class", "unk"), GREY)
            box = RoundedRectangle(width=2.6, height=1.2, corner_radius=0.15)
            box.set_stroke(color, width=4).set_fill(color, opacity=0.25)
            label = Text(s.get("name", sid), color=WHITE, width=2.2).scale(0.3)
            label.move_to(box)
            nodes[sid] = (box, label)

        by_name = {s.get("name"): sid for sid, s in zip(nodes.keys(), systems)}

        def resolve(ref):
            if ref in nodes:
                return ref
            return by_name.get(ref)

        edges = []
        for key in ("upstream", "downstream"):
            for edge in self.flows.get(key) or []:
                if not isinstance(edge, dict):
                    continue
                frm, to = resolve(edge.get("from")), resolve(edge.get("to"))
                if frm is not None and to is not None and frm != to:
                    edges.append((frm, to))

        if edges:
            cols = min(3, n)
            rows = ceil(n / cols)
            for i, (box, _) in enumerate(nodes.values()):
                x = (i % cols - (cols - 1) / 2) * 4
                y = ((rows - 1) / 2 - i // cols) * 1.8
                box.move_to([x, y, 0])
        else:
            for i, (box, _) in enumerate(nodes.values()):
                box.move_to([-6.25 + i * 12.5 / max(n - 1, 1), 0, 0])
            ids = list(nodes.keys())
            edges = [(ids[i], ids[i + 1]) for i in range(n - 1)]

        for box, label in nodes.values():
            self.play(Create(box), Write(label), run_time=0.6)

        for frm, to in edges:
            arrow = Arrow(nodes[frm][0].get_right(), nodes[to][0].get_left(), buff=0.15)
            self.play(Create(arrow), run_time=0.5)

        self.wait(1)
