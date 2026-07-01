// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimatedDigits } from "./AnimatedDigits";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("motion/react", async () => {
  const React = await import("react");

  const MotionSpan = ({
    initial,
    animate,
    exit,
    transition,
    children,
    ...props
  }: React.HTMLAttributes<HTMLSpanElement> & {
    initial?: unknown;
    animate?: unknown;
    exit?: unknown;
    transition?: unknown;
  }) => (
    <span
      data-animate={JSON.stringify(animate)}
      data-exit={JSON.stringify(exit)}
      data-initial={JSON.stringify(initial)}
      data-motion="true"
      {...props}
    >
      {children}
    </span>
  );

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: { span: MotionSpan },
    useReducedMotion: () => false,
  };
});

const renderDigits = async (value: string) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<AnimatedDigits value={value} />);
  });

  return { container, root };
};

const rerenderDigits = async (root: Root, value: string) => {
  await act(async () => {
    root.render(<AnimatedDigits value={value} />);
  });
};

describe("AnimatedDigits", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("slides digits upward when the numeric value increases", async () => {
    const view = await renderDigits("\u20aa \u0669");

    await rerenderDigits(view.root, "\u20aa \u0661\u0660");

    const animatedDigits = Array.from(view.container.querySelectorAll(".t-digit[data-motion='true']"));

    expect(animatedDigits.length).toBeGreaterThan(0);
    expect(animatedDigits.every((digit) => digit.getAttribute("data-initial")?.includes('"y":"100%"'))).toBe(true);
  });

  it("slides digits downward when the numeric value decreases", async () => {
    const view = await renderDigits("\u20aa \u0661\u0660");

    await rerenderDigits(view.root, "\u20aa \u0669");

    const animatedDigits = Array.from(view.container.querySelectorAll(".t-digit[data-motion='true']"));

    expect(animatedDigits.length).toBeGreaterThan(0);
    expect(animatedDigits.every((digit) => digit.getAttribute("data-initial")?.includes('"y":"-100%"'))).toBe(true);
  });

  it("keeps currency symbols and separators static while digits trend", async () => {
    const view = await renderDigits("\u20aa \u0661\u0660");

    await rerenderDigits(view.root, "\u20aa \u0661\u0661");

    expect(view.container.querySelectorAll(".t-digit-static [data-motion='true']")).toHaveLength(0);
  });
});
