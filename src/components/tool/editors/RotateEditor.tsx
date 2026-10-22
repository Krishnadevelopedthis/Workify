"use client";

import { Icon } from "../../Icon";
import { FileCards } from "../FileCards";
import { Workspace } from "../GenericWorkspace";
import { useFilePicker } from "../SelectFiles";
import type { EditorProps } from "../ToolRunner";

export default function RotateEditor({ tool, items, setItems, addFiles, submit, error, setError }: EditorProps) {
  const picker = useFilePicker(tool, addFiles);
  const rotateAll = (delta: number) =>
    setItems(items.map((i) => ({ ...i, rotation: (((i.rotation + delta) % 360) + 360) % 360 })));

  function go() {
    if (items.every((i) => i.rotation === 0)) return setError("Rotate at least one file first.");
    submit(
      items.map((i) => i.file),
      { rotations: Object.fromEntries(items.map((it, idx) => [idx, { all: it.rotation }])) },
    );
  }

  return (
    <Workspace
      title={tool.name}
      error={error}
      action={tool.action}
      onAction={go}
      main={
        <>
          <FileCards items={items} setItems={setItems} canRotate sortable={false} onAddMore={picker.open} />
          {picker.element}
        </>
      }
      sidebar={
        <div className="space-y-5">
          <p className="rounded-lg bg-bg p-4 text-sm text-muted">
            Hover a file and click the rotate icon to turn just that file, or rotate every file at once below.
          </p>
          <div>
            <p className="mb-2 text-sm font-semibold">Rotation</p>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-secondary" onClick={() => rotateAll(90)}>
                <Icon name="rotate-clockwise" size={20} /> Right
              </button>
              <button className="btn-secondary" onClick={() => rotateAll(-90)}>
                <Icon name="rotate" size={20} /> Left
              </button>
            </div>
          </div>
          <button className="text-sm font-medium text-brand underline" onClick={() => setItems(items.map((i) => ({ ...i, rotation: 0 })))}>
            Reset all
          </button>
        </div>
      }
    />
  );
}
