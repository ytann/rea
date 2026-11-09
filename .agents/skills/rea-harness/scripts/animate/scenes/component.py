from manim import (
    BLUE,
    DOWN,
    GREY,
    GREEN,
    ORANGE,
    Create,
    FadeIn,
    RoundedRectangle,
    Scene,
    Text,
    VGroup,
    WHITE,
    Write,
)

EVIDENCE_COLORS = {
    "obs": GREEN,
    "der": BLUE,
    "inf": ORANGE,
    "unk": GREY,
}


class Component(Scene):
    @classmethod
    def constructor(cls, system):
        scene = cls()
        scene.system = system or {}
        return scene

    def construct(self):
        s = self.system
        color = EVIDENCE_COLORS.get(s.get("evidence_class", "unk"), GREY)
        box = RoundedRectangle(width=6, height=2.2, corner_radius=0.2)
        box.set_stroke(color, width=5).set_fill(color, opacity=0.25)
        name = Text(s.get("name", "unnamed"), color=WHITE, width=5.4).scale(0.7)
        tag = Text(s.get("evidence_class", "unk"), color=color).scale(0.4)
        tag.next_to(name, DOWN, buff=0.2)
        header = VGroup(name, tag).move_to(box)
        self.play(Create(box), Write(header))
        justification = s.get("justification", "").strip()
        if justification:
            caption = Text(justification, color=GREY, width=13).scale(0.45)
            caption.next_to(box, DOWN, buff=0.5)
            self.play(FadeIn(caption))
        self.wait(1)
