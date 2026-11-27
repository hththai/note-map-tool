import { Btn } from './ui.jsx';

/* Asked before a swimlane flow becomes a free canvas, because it cannot be turned back into lanes. */
export default function SwitchLayout({ name, onCancel, onSwitch }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-auto bg-slate-900/40 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-label="Switch to free canvas" className="my-auto w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}>
        <h2 className="mb-2 text-lg font-semibold">Switch “{name}” to a free canvas?</h2>
        <p className="text-sm text-slate-700">A free canvas lets you place boxes anywhere and resize them, like a slide, and draw an arrow between any two boxes.</p>
        <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
          <li>Every step keeps its place on screen and every arrow it has now.</li>
          <li>The lanes go away. <b>This cannot be turned back into lanes.</b></li>
          <li>You can still press Undo until you Save.</li>
        </ul>
        <div className="mt-4 flex justify-end gap-2"><Btn onClick={onCancel}>Cancel</Btn><Btn primary onClick={onSwitch}>Switch to free canvas</Btn></div>
      </div>
    </div>
  );
}
