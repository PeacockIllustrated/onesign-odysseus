"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { Clock, Keyboard, X } from "lucide-react";

/**
 * Production hours, picked on a clock face.
 *
 * The same picker the Who Cares studio uses for a time of day (two big boxes,
 * a dial for the hours then the minutes, Cancel and OK, a keyboard switch for
 * typing) — reworked for a DURATION and dressed in Onesign's tokens:
 *
 *  - The hours dial reads as hours of work: 0–11 round the outside, 12–23
 *    inside. A job that needs more than 23 hours on one operation is typed
 *    with the keyboard switch, which takes any number.
 *  - The minutes dial snaps to quarter hours (00 / 15 / 30 / 45) — how
 *    production time is estimated. A value off the quarter (an old job at
 *    1.1 hrs) still shows, with a dot on the hand, and can be typed.
 *  - "Clear" sets the operation back to no hours, the common case.
 *
 * The value in and out is decimal hours (2.25 = 2 h 15 m), what the engine
 * prices, so it drops in where the number box was.
 */

const pad = (n: number) => String(n).padStart(2, "0");

function split(hours: number) {
  const total = Math.max(0, Math.round((hours || 0) * 60));
  return { h: Math.floor(total / 60), m: total % 60 };
}

/** "2 h 15 m", "45 m", "—" for none. */
export function formatHours(hours: number) {
  const { h, m } = split(hours);
  if (!h && !m) return "—";
  if (!m) return `${h} h`;
  if (!h) return `${m} m`;
  return `${h} h ${pad(m)} m`;
}

export function HoursField({
  value,
  onChange,
  label,
  id,
}: {
  value: number;
  onChange: (hours: number) => void;
  /** Names the operation in the picker's heading ("Fabrication"). */
  label: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const none = !(value > 0);

  return (
    <>
      <button
        ref={button}
        id={id}
        type="button"
        className="calc-input calc-hours-field"
        data-empty={none || undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Clock size={14} aria-hidden="true" />
        <span>{formatHours(value)}</span>
      </button>
      {/* Portalled to <body>: the field sits inside a <label>, and a
                dialog inside a label has every click in it forwarded to the
                field button — pressing OK re-opened the picker. */}
      {open &&
        createPortal(
          <HoursPicker
            title={`${label} hours`}
            value={value}
            onCancel={() => {
              setOpen(false);
              button.current?.focus();
            }}
            onConfirm={(next) => {
              onChange(next);
              setOpen(false);
              button.current?.focus();
            }}
          />,
          document.body,
        )}
    </>
  );
}

type Mode = "hour" | "minute";
const OUTER = 40;
const INNER = 26;
const STEP = 15;

/** Where a number sits on the dial, in percent of its width. */
function spot(index: number, radius: number) {
  const angle = (index / 12) * 2 * Math.PI;
  return { x: 50 + radius * Math.sin(angle), y: 50 - radius * Math.cos(angle) };
}

function HoursPicker({
  title,
  value,
  onCancel,
  onConfirm,
}: {
  title: string;
  value: number;
  onCancel: () => void;
  onConfirm: (hours: number) => void;
}) {
  const start = split(value);
  const [hour, setHour] = useState(start.h);
  const [minute, setMinute] = useState(start.m);
  const [mode, setMode] = useState<Mode>("hour");
  // Over 23 hours cannot sit on the dial, so it opens on the keyboard.
  const [typing, setTyping] = useState(start.h > 23);
  const [typedHour, setTypedHour] = useState(String(start.h));
  const [typedMinute, setTypedMinute] = useState(pad(start.m));
  const [invalid, setInvalid] = useState(false);
  const titleId = useId();
  const errorId = useId();
  const okRef = useRef<HTMLButtonElement>(null);

  // Escape closes, as every dialog in the portal does.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const typed = () => {
    if (!/^\d{1,3}$/.test(typedHour) || !/^\d{1,2}$/.test(typedMinute))
      return null;
    const h = Number(typedHour);
    const m = Number(typedMinute);
    return m > 59 ? null : { h, m };
  };

  const finish = (h: number, m: number) =>
    onConfirm(Math.round((h + m / 60) * 10000) / 10000);

  const confirm = () => {
    if (!typing) return finish(hour, minute);
    const t = typed();
    if (!t) return setInvalid(true);
    finish(t.h, t.m);
  };

  const toTyping = () => {
    setTypedHour(String(hour));
    setTypedMinute(pad(minute));
    setInvalid(false);
    setTyping(true);
  };
  const toDial = () => {
    const t = typed();
    if (t) {
      setHour(Math.min(23, t.h));
      setMinute(t.m);
    }
    setInvalid(false);
    setTyping(false);
  };

  return (
    <div
      className="calc-dial-scrim"
      onPointerDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        className="calc-dial-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="calc-dial-head">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="calc-iconbtn"
            aria-label="Close"
            onClick={onCancel}
          >
            <X size={16} />
          </button>
        </div>

        {typing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              confirm();
            }}
          >
            <div className="calc-dial-boxes">
              <label>
                <input
                  autoFocus
                  inputMode="numeric"
                  maxLength={3}
                  autoComplete="off"
                  className="calc-dial-box"
                  aria-invalid={invalid || undefined}
                  aria-describedby={invalid ? errorId : undefined}
                  value={typedHour}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => {
                    setTypedHour(e.target.value.replace(/\D/g, ""));
                    setInvalid(false);
                  }}
                />
                <span>Hours</span>
              </label>
              <span className="colon" aria-hidden="true">
                :
              </span>
              <label>
                <input
                  inputMode="numeric"
                  maxLength={2}
                  autoComplete="off"
                  className="calc-dial-box"
                  aria-invalid={invalid || undefined}
                  aria-describedby={invalid ? errorId : undefined}
                  value={typedMinute}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => {
                    setTypedMinute(e.target.value.replace(/\D/g, ""));
                    setInvalid(false);
                  }}
                />
                <span>Minutes</span>
              </label>
            </div>
            {invalid && (
              <p id={errorId} role="alert" className="calc-dial-error">
                Enter whole hours and minutes from 0 to 59.
              </p>
            )}
            <button type="submit" hidden />
          </form>
        ) : (
          <>
            <div className="calc-dial-boxes">
              <label>
                <button
                  type="button"
                  className="calc-dial-box"
                  aria-pressed={mode === "hour"}
                  aria-label={`Hours ${hour}`}
                  onClick={() => setMode("hour")}
                >
                  {pad(hour)}
                </button>
                <span>Hours</span>
              </label>
              <span className="colon" aria-hidden="true">
                :
              </span>
              <label>
                <button
                  type="button"
                  className="calc-dial-box"
                  aria-pressed={mode === "minute"}
                  aria-label={`Minutes ${pad(minute)}`}
                  onClick={() => setMode("minute")}
                >
                  {pad(minute)}
                </button>
                <span>Minutes</span>
              </label>
            </div>
            <Dial
              key={mode}
              mode={mode}
              hour={hour}
              minute={minute}
              onHour={setHour}
              onMinute={setMinute}
              onDone={() =>
                mode === "hour" ? setMode("minute") : okRef.current?.focus()
              }
            />
          </>
        )}

        <div className="calc-dial-foot">
          <button
            type="button"
            className="calc-iconbtn calc-dial-switch"
            aria-label={typing ? "Use the clock" : "Type the hours"}
            title={typing ? "Use the clock" : "Type the hours"}
            onClick={typing ? toDial : toTyping}
          >
            {typing ? <Clock size={18} /> : <Keyboard size={18} />}
          </button>
          <button
            type="button"
            className="calc-dial-text"
            onClick={() => finish(0, 0)}
          >
            Clear
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="calc-dial-text" onClick={onCancel}>
            Cancel
          </button>
          <button
            ref={okRef}
            type="button"
            className="btn-primary calc-dial-ok"
            onClick={confirm}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function Dial({
  mode,
  hour,
  minute,
  onHour,
  onMinute,
  onDone,
}: {
  mode: Mode;
  hour: number;
  minute: number;
  onHour: (h: number) => void;
  onMinute: (m: number) => void;
  onDone: () => void;
}) {
  const face = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const focusAfter = useRef(false);
  const selected = mode === "hour" ? hour : minute;

  // After an arrow key, keep focus on the number the hand moved to.
  useEffect(() => {
    if (!focusAfter.current) return;
    focusAfter.current = false;
    face.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }, [selected]);

  const set = (next: number) => {
    if (next === selected) return;
    if (mode === "hour") onHour(next);
    else onMinute(next);
  };

  /** The number under a point on the face. */
  const fromPoint = (x: number, y: number) => {
    const rect = face.current?.getBoundingClientRect();
    if (!rect) return null;
    const dx = x - (rect.left + rect.width / 2);
    const dy = y - (rect.top + rect.height / 2);
    const turn = (Math.atan2(dx, -dy) / (2 * Math.PI) + 1) % 1;
    if (mode === "minute") return (Math.round((turn * 60) / STEP) * STEP) % 60;
    const index = Math.round(turn * 12) % 12;
    const distance = (Math.hypot(dx, dy) / rect.width) * 100;
    return distance < (OUTER + INNER) / 2 ? index + 12 : index;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const next = fromPoint(e.clientX, e.clientY);
    if (next !== null) set(next);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const next = fromPoint(e.clientX, e.clientY);
    if (next !== null) set(next);
  };
  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (mode === "hour") onDone();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const by = mode === "hour" ? 1 : STEP;
    const size = mode === "hour" ? 24 : 60;
    const move = (delta: number) => {
      e.preventDefault();
      focusAfter.current = true;
      const next =
        delta > 0
          ? Math.floor(selected / by) * by + by
          : Math.ceil(selected / by) * by - by;
      set(((next % size) + size) % size);
    };
    if (e.key === "ArrowRight" || e.key === "ArrowUp") move(by);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") move(-by);
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onDone();
    }
  };

  const marks =
    mode === "hour"
      ? Array.from({ length: 24 }, (_, v) => ({
          value: v,
          text: String(v),
          ...spot(v % 12, v < 12 ? OUTER : INNER),
          inner: v >= 12,
        }))
      : [0, 15, 30, 45].map((v) => ({
          value: v,
          text: pad(v),
          ...spot(v / 5, OUTER),
          inner: false,
        }));

  const hand =
    mode === "hour"
      ? spot(hour % 12, hour < 12 ? OUTER : INNER)
      : spot((minute / 60) * 12, OUTER);
  const onMark = marks.some((m) => m.value === selected);
  const bubble = mode === "hour" && hour >= 12 ? 6.5 : 7.5;

  return (
    <div className="calc-dial-wrap">
      <div
        ref={face}
        role="radiogroup"
        aria-label={mode === "hour" ? "Hours" : "Minutes"}
        className="calc-dial-face"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (dragging.current = false)}
        onKeyDown={onKeyDown}
      >
        <svg aria-hidden="true" viewBox="0 0 100 100">
          {mode === "minute" &&
            Array.from({ length: 12 }, (_, i) => {
              const t = spot(i, OUTER);
              return i % 3 ? (
                <circle key={i} cx={t.x} cy={t.y} r="0.8" className="tick" />
              ) : null;
            })}
          <line
            x1="50"
            y1="50"
            x2={hand.x}
            y2={hand.y}
            className="hand"
            strokeWidth="0.9"
            strokeLinecap="round"
          />
          <circle cx="50" cy="50" r="1.6" className="hub" />
          <circle cx={hand.x} cy={hand.y} r={bubble} className="hub" />
          {!onMark && (
            <circle cx={hand.x} cy={hand.y} r="1.1" className="dot" />
          )}
        </svg>
        {marks.map((m) => {
          const checked = m.value === selected;
          return (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={
                mode === "hour" ? `${m.value} hours` : `${m.value} minutes`
              }
              tabIndex={
                checked || (!onMark && m.value === marks[0].value) ? 0 : -1
              }
              // Pointer presses are handled by the face (which also
              // follows a drag); this is for a keyboard or reader.
              onClick={(e) => {
                if (e.detail !== 0) return;
                set(m.value);
                onDone();
              }}
              style={{ left: `${m.x}%`, top: `${m.y}%` }}
              className={`calc-dial-mark${m.inner ? " inner" : ""}${checked ? " on" : ""}`}
            >
              {m.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
