// @vitest-environment jsdom

import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Modal } from "./Modal";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const renderModal = async (open: boolean) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <Modal open={open} title="تفاصيل العميل" onClose={() => undefined}>
        <p>محتوى المودال</p>
      </Modal>,
    );
  });

  return { container, root };
};

describe("Modal", () => {
  let mounted: { container: HTMLDivElement; root: Root } | null = null;

  afterEach(async () => {
    if (mounted) {
      await act(async () => {
        mounted?.root.unmount();
      });
      mounted.container.remove();
      mounted = null;
    }

    document.documentElement.className = "";
    document.querySelector('meta[name="theme-color"]')?.remove();
    document.body.innerHTML = "";
  });

  it("marks the document as modal-open while a modal is visible", async () => {
    mounted = await renderModal(true);

    expect(document.documentElement.classList.contains("modal-open")).toBe(true);
  });

  it("renders the backdrop directly under the document body", async () => {
    mounted = await renderModal(true);

    const backdrop = document.querySelector(".modal-backdrop");

    expect(backdrop?.parentElement).toBe(document.body);
  });

  it("sets the browser theme color to the modal backdrop while visible", async () => {
    const themeColor = document.createElement("meta");
    themeColor.setAttribute("name", "theme-color");
    themeColor.setAttribute("content", "#f7f8f6");
    document.head.appendChild(themeColor);

    mounted = await renderModal(true);

    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe("#8c8d8c");
  });

  it("keeps modal-open until all visible modals are closed", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted = { container, root };

    await act(async () => {
      root.render(
        <>
          <Modal open title="تفاصيل العميل" onClose={() => undefined}>
            <p>المودال الأول</p>
          </Modal>
          <Modal open title="تفاصيل الدين" onClose={() => undefined}>
            <p>المودال الثاني</p>
          </Modal>
        </>,
      );
    });

    await act(async () => {
      root.render(
        <Modal open title="تفاصيل العميل" onClose={() => undefined}>
          <p>المودال الأول</p>
        </Modal>,
      );
    });

    expect(document.documentElement.classList.contains("modal-open")).toBe(true);
  });
});
