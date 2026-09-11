/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react';

interface BlockItem {
  label: string;
  threshold: number;
}

export default function App() {
  // Live clock state - formatted as DD/MM/YYYY
  const [currentDate, setCurrentDate] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<string>('');

  // Exam name state
  const [examName, setExamName] = useState<string>('');

  // Timer state
  const [durationInput, setDurationInput] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'running' | 'paused' | 'finished'>('idle');
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [totalSeconds, setTotalSeconds] = useState<number>(0);
  const [blocks, setBlocks] = useState<BlockItem[]>([]);
  const [message, setMessage] = useState<string>('');

  // Student Lockout Policy (Times students CANNOT leave)
  const [lockoutPolicyEnabled, setLockoutPolicyEnabled] = useState<boolean>(false);
  const [lockFirstPeriod, setLockFirstPeriod] = useState<boolean>(true);
  const [firstLockMinutes, setFirstLockMinutes] = useState<number>(40);
  const [lockLastPeriod, setLockLastPeriod] = useState<boolean>(true);
  const [lastLockMinutes, setLastLockMinutes] = useState<number>(30);

  // Target end timestamp in ms
  const targetTimeRef = useRef<number | null>(null);
  const remainingSecondsRef = useRef<number>(0);
  remainingSecondsRef.current = remainingSeconds;

  // Draggable split panel state
  const [leftWidthPercent, setLeftWidthPercent] = useState<number>(35);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const layoutRef = useRef<HTMLDivElement>(null);

  // Floating movable & resizable instructions / code box
  const [showNote, setShowNote] = useState<boolean>(false);
  const [notePosition, setNotePosition] = useState<{ x: number; y: number }>({ x: 40, y: 120 });
  const [noteText, setNoteText] = useState<string>('');
  const [noteFontSize, setNoteFontSize] = useState<number>(20);
  const [isDraggingNote, setIsDraggingNote] = useState<boolean>(false);
  const noteDragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);

  // Set intelligent initial note position on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const initX = window.innerWidth > 800 ? Math.max(30, window.innerWidth - 380) : 30;
      setNotePosition({ x: initX, y: 100 });
    }
  }, []);

  // Live clock ticker - formatted DD/MM/YYYY
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      setCurrentDate(`Date: ${day}/${month}/${year}`);
      setCurrentTime(`Time: ${now.toLocaleTimeString()}`);
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Half-hour blocks generator
  const createHalfHourBlocks = useCallback((totalSecs: number) => {
    const newBlocks: BlockItem[] = [];
    let t = totalSecs;

    while (t > 0) {
      const h = Math.floor(t / 3600);
      const m = Math.floor((t % 3600) / 60);
      const label = `${h}:${String(m).padStart(2, '0')}`;
      newBlocks.push({ label, threshold: t });
      t -= 1800; // 30 minutes
    }

    newBlocks.push({ label: '0:00', threshold: 0 });
    setBlocks(newBlocks);
  }, []);

  // Active countdown interval
  useEffect(() => {
    if (status !== 'running') return;

    const interval = setInterval(() => {
      if (!targetTimeRef.current) return;

      const now = Date.now();
      const diffSeconds = Math.floor((targetTimeRef.current - now) / 1000);

      if (diffSeconds <= 0) {
        clearInterval(interval);
        setRemainingSeconds(0);
        setStatus('finished');
      } else {
        setRemainingSeconds(diffSeconds);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [status]);

  // Format remaining time H:MM:SS
  const formatRemaining = useCallback((): string => {
    if (status === 'idle') return '';
    if (status === 'finished') return 'Finished!';

    const h = Math.floor(remainingSeconds / 3600);
    const m = Math.floor((remainingSeconds % 3600) / 60);
    const s = remainingSeconds % 60;

    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, [status, remainingSeconds]);

  // Format minutes into H:MM
  const formatMinutes = (mins: number): string => {
    const h = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    return `${h}:${String(m).padStart(2, '0')}`;
  };

  // Format timestamp into local clock time (e.g. 9:40 AM or 09:40)
  const formatExactClockTime = (timestampMs: number): string => {
    const d = new Date(timestampMs);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  // Evaluate student leaving status based on active lockouts and exact clock times
  const getLockoutStatus = useCallback((): {
    isLocked: boolean;
    title: string;
    timeText: string;
  } => {
    if (status === 'finished' || (status !== 'idle' && remainingSeconds <= 0)) {
      return {
        isLocked: true,
        title: 'EXAM HAS FINISHED',
        timeText: 'Please remain seated until dismissed',
      };
    }

    if (!lockoutPolicyEnabled || totalSeconds <= 0) {
      return { isLocked: false, title: '', timeText: '' };
    }

    const elapsedSecs = totalSeconds - remainingSeconds;
    const elapsedM = elapsedSecs / 60;
    const remainM = remainingSeconds / 60;
    const totalM = totalSeconds / 60;

    // Calculate projected timestamps (in ms) based on timer target
    const finishMs =
      status === 'running' && targetTimeRef.current
        ? targetTimeRef.current
        : Date.now() + remainingSeconds * 1000;
    const startMs = finishMs - totalSeconds * 1000;

    const firstLockEndMs = startMs + firstLockMinutes * 60 * 1000;
    const lastLockStartMs = finishMs - lastLockMinutes * 60 * 1000;

    const firstLockEndTimeStr = formatExactClockTime(firstLockEndMs);
    const lastLockStartTimeStr = formatExactClockTime(lastLockStartMs);
    const examEndTimeStr = formatExactClockTime(finishMs);

    // Case 0: If lockouts overlap or exceed total duration, no leaving is permitted
    if (lockFirstPeriod && lockLastPeriod && firstLockMinutes + lastLockMinutes >= totalM) {
      return {
        isLocked: true,
        title: 'STUDENTS CANNOT LEAVE',
        timeText: `No leaving allowed • Exam ends at ${examEndTimeStr}`,
      };
    }

    // Check Lockout 1: First X minutes
    if (lockFirstPeriod && elapsedM < firstLockMinutes) {
      const timeText = lockLastPeriod
        ? `Can leave at ${firstLockEndTimeStr} (until ${lastLockStartTimeStr})`
        : `Can leave at ${firstLockEndTimeStr}`;
      return {
        isLocked: true,
        title: 'STUDENTS CANNOT LEAVE',
        timeText,
      };
    }

    // Check Lockout 2: Last Y minutes
    if (lockLastPeriod && remainM <= lastLockMinutes) {
      return {
        isLocked: true,
        title: 'STUDENTS CANNOT LEAVE',
        timeText: `Final lockout • Exam ends at ${examEndTimeStr}`,
      };
    }

    // Allowed period (neither first nor last lockout applies)
    if (lockLastPeriod) {
      return {
        isLocked: false,
        title: 'STUDENTS MAY LEAVE',
        timeText: `Can leave until ${lastLockStartTimeStr}`,
      };
    }

    return {
      isLocked: false,
      title: 'STUDENTS MAY LEAVE',
      timeText: `Can leave until exam ends at ${examEndTimeStr}`,
    };
  }, [
    lockoutPolicyEnabled,
    totalSeconds,
    remainingSeconds,
    status,
    lockFirstPeriod,
    firstLockMinutes,
    lockLastPeriod,
    lastLockMinutes,
  ]);

  const lockoutStatus = getLockoutStatus();

  // Handlers
  const handleStart = () => {
    const mins = parseInt(durationInput.trim(), 10);
    if (isNaN(mins) || mins <= 0) {
      setMessage('Enter a valid duration.');
      return;
    }

    setMessage('');
    const totalSecs = mins * 60;
    setTotalSeconds(totalSecs);
    setRemainingSeconds(totalSecs);
    targetTimeRef.current = Date.now() + totalSecs * 1000;

    createHalfHourBlocks(totalSecs);
    setStatus('running');
  };

  const handlePause = () => {
    if (status !== 'running') return;
    setStatus('paused');
  };

  const handleResume = () => {
    if (status !== 'paused') return;
    targetTimeRef.current = Date.now() + remainingSecondsRef.current * 1000;
    setStatus('running');
  };

  const handleReset = () => {
    setStatus('idle');
    setRemainingSeconds(0);
    setTotalSeconds(0);
    targetTimeRef.current = null;
    setMessage('');
    setDurationInput('');
    setBlocks([]);
  };

  // Draggable resizer logic (supports mouse and touch)
  const handleStartDrag = useCallback(() => {
    setIsDragging(true);
    document.body.style.cursor = 'col-resize';
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (clientX: number) => {
      if (!layoutRef.current) return;
      const totalWidth = layoutRef.current.offsetWidth;
      if (totalWidth <= 0) return;

      let newLeftWidth = (clientX / totalWidth) * 100;
      if (newLeftWidth < 20) newLeftWidth = 20;
      if (newLeftWidth > 70) newLeftWidth = 70;

      setLeftWidthPercent(newLeftWidth);
    };

    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX);
      }
    };

    const onEndDrag = () => {
      setIsDragging(false);
      document.body.style.cursor = 'default';
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onEndDrag);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onEndDrag);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onEndDrag);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onEndDrag);
      document.body.style.cursor = 'default';
    };
  }, [isDragging]);

  // Movable note drag handlers (mouse & touch)
  const handleNoteDragStart = (e: ReactMouseEvent | ReactTouchEvent) => {
    // Ignore clicks on buttons, font controls, or the textarea itself
    if ((e.target as HTMLElement).closest('.floating-close-btn, .floating-font-controls, button, textarea')) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    noteDragStartRef.current = {
      startX: clientX,
      startY: clientY,
      initX: notePosition.x,
      initY: notePosition.y,
    };
    setIsDraggingNote(true);
  };

  useEffect(() => {
    if (!isDraggingNote) return;

    const onNoteMove = (clientX: number, clientY: number) => {
      if (!noteDragStartRef.current) return;
      const dx = clientX - noteDragStartRef.current.startX;
      const dy = clientY - noteDragStartRef.current.startY;

      const maxX = Math.max(10, window.innerWidth - 80);
      const maxY = Math.max(10, window.innerHeight - 50);

      const nextX = Math.min(Math.max(10, noteDragStartRef.current.initX + dx), maxX);
      const nextY = Math.min(Math.max(10, noteDragStartRef.current.initY + dy), maxY);

      setNotePosition({ x: nextX, y: nextY });
    };

    const handleMouseMove = (e: MouseEvent) => onNoteMove(e.clientX, e.clientY);
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        onNoteMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const onNoteEndDrag = () => {
      setIsDraggingNote(false);
      noteDragStartRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', onNoteEndDrag);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', onNoteEndDrag);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', onNoteEndDrag);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', onNoteEndDrag);
    };
  }, [isDraggingNote]);

  const parsedDurationMins = parseInt(durationInput) || 0;

  return (
    <div
      id="layout"
      ref={layoutRef}
      style={{
        gridTemplateColumns: `${leftWidthPercent}% 5px ${100 - leftWidthPercent}%`,
      }}
    >
      {/* LEFT PANEL */}
      <div id="left-panel">
        <br />
        <br />
        <br />
        <div id="half-hour-blocks">
          {blocks.map((block, idx) => {
            const isCrossed = status !== 'idle' && remainingSeconds <= block.threshold;
            return (
              <div
                key={idx}
                className="block-item"
                style={{
                  textDecoration: isCrossed ? 'line-through' : 'none',
                  opacity: isCrossed ? 0.4 : 1,
                }}
              >
                {block.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* DRAGGABLE RESIZER */}
      <div
        id="drag-bar"
        className={isDragging ? 'dragging' : ''}
        onMouseDown={handleStartDrag}
        onTouchStart={handleStartDrag}
        title="Drag to resize panels"
      />

      {/* RIGHT PANEL */}
      <div id="right-panel">
        <br />
        <br />
        <input
          id="exam-entry"
          type="text"
          placeholder="Enter Exam Name"
          value={examName}
          onChange={(e) => setExamName(e.target.value)}
        />

        <div id="datetime">
          <div id="date-label">{currentDate}</div>
          <div id="time-label">{currentTime}</div>
        </div>

        {/* Real-time Student Lockout Indicator (High Visibility) */}
        {(lockoutPolicyEnabled || status === 'finished') && (status === 'running' || status === 'paused' || status === 'finished') && (
          <div id="leaving-indicator-container">
            <div
              className={`leaving-badge ${
                lockoutStatus.isLocked ? 'forbidden' : 'allowed'
              }`}
            >
              <div className="leaving-badge-top">
                <span className="leaving-pulse" />
                <span>{lockoutStatus.title}</span>
              </div>
              {lockoutStatus.timeText && (
                <div className="leaving-time-text">
                  {lockoutStatus.timeText}
                </div>
              )}
            </div>
          </div>
        )}

        <h1 id="TR">Time Remaining:</h1>
        <h1 id="remaining-label">{formatRemaining()}</h1>

        <br />

        {/* Duration input - only visible when setting up before start */}
        {status === 'idle' && (
          <div id="duration-section">
            <label htmlFor="duration-input">Enter duration (minutes):</label>
            <input
              type="number"
              id="duration-input"
              min="1"
              value={durationInput}
              onChange={(e) => setDurationInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && status === 'idle') {
                  handleStart();
                }
              }}
            />
          </div>
        )}

        {/* Optional Student Lockout Configuration (Times Students CANNOT Leave) */}
        {status === 'idle' && (
          <div className="mt-4 mb-2">
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-medium bg-[#1A3383] px-3.5 py-1.5 rounded-full border border-white/20 hover:border-white/50 transition">
              <input
                type="checkbox"
                checked={lockoutPolicyEnabled}
                onChange={(e) => setLockoutPolicyEnabled(e.target.checked)}
                className="w-4 h-4 accent-red-400 rounded cursor-pointer"
              />
              <span>Set times students cannot leave</span>
            </label>

            {lockoutPolicyEnabled && (
              <div id="leaving-config-card">
                <div className="font-bold text-white text-sm mb-2 border-b border-white/20 pb-1.5 flex items-center justify-between">
                  <span>Student Lockout Times (No Leaving Allowed)</span>
                  <span className="text-xs text-white/70 font-normal">
                    Customizable per exam
                  </span>
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="lock-first"
                      checked={lockFirstPeriod}
                      onChange={(e) => setLockFirstPeriod(e.target.checked)}
                      className="w-4 h-4 accent-red-400 rounded"
                    />
                    <label htmlFor="lock-first" className="cursor-pointer">
                      Cannot leave during the first
                      <input
                        type="number"
                        min="1"
                        className="leaving-num-input"
                        value={firstLockMinutes}
                        disabled={!lockFirstPeriod}
                        onChange={(e) =>
                          setFirstLockMinutes(Math.max(1, parseInt(e.target.value) || 1))
                        }
                      />
                      minutes
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="lock-last"
                      checked={lockLastPeriod}
                      onChange={(e) => setLockLastPeriod(e.target.checked)}
                      className="w-4 h-4 accent-red-400 rounded"
                    />
                    <label htmlFor="lock-last" className="cursor-pointer">
                      Cannot leave during the last
                      <input
                        type="number"
                        min="1"
                        className="leaving-num-input"
                        value={lastLockMinutes}
                        disabled={!lockLastPeriod}
                        onChange={(e) =>
                          setLastLockMinutes(Math.max(1, parseInt(e.target.value) || 1))
                        }
                      />
                      minutes
                    </label>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-white/15 text-xs text-white/80">
                  <span className="font-semibold text-rose-300">Lockout Summary: </span>
                  {lockFirstPeriod && `No leaving first ${firstLockMinutes}m`}
                  {lockFirstPeriod && lockLastPeriod ? ' • ' : ''}
                  {lockLastPeriod && `No leaving last ${lastLockMinutes}m`}
                  {!lockFirstPeriod && !lockLastPeriod && 'No lockouts set (students may leave at any time)'}

                  {parsedDurationMins > 0 && (lockFirstPeriod || lockLastPeriod) && (
                    <div className="text-emerald-300 font-medium mt-1">
                      Students may leave: from minute {lockFirstPeriod ? firstLockMinutes : 0} to minute {lockLastPeriod ? Math.max(0, parsedDurationMins - lastLockMinutes) : parsedDurationMins} ({formatMinutes(lockFirstPeriod ? firstLockMinutes : 0)} – {formatMinutes(lockLastPeriod ? Math.max(0, parsedDurationMins - lastLockMinutes) : parsedDurationMins)}).
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div id="controls">
          <button
            id="start-btn"
            disabled={status !== 'idle'}
            onClick={handleStart}
          >
            Start
          </button>
          <button
            id="pause-btn"
            disabled={status !== 'running'}
            onClick={handlePause}
          >
            Pause
          </button>
          <button
            id="resume-btn"
            disabled={status !== 'paused'}
            onClick={handleResume}
          >
            Resume
          </button>
          <button
            id="reset-btn"
            onClick={handleReset}
          >
            Reset
          </button>
          <button
            id="note-toggle-btn"
            type="button"
            onClick={() => setShowNote((prev) => !prev)}
            title="Toggle movable instructions / codes box"
          >
            + Note
          </button>
        </div>

        <div id="message-label">{message}</div>
      </div>

      {/* Movable & Resizable Instructions / Codes Box */}
      {showNote && (
        <div
          id="floating-instruction-box"
          className="floating-instruction-box"
          style={{
            left: `${notePosition.x}px`,
            top: `${notePosition.y}px`,
          }}
        >
          <div
            className="floating-header"
            onMouseDown={handleNoteDragStart}
            onTouchStart={handleNoteDragStart}
            title="Drag to move anywhere"
          >
            <div className="flex items-center gap-1.5 pointer-events-none select-none">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
                <circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>
              </svg>
              <span>Instructions / Codes</span>
            </div>

            <div className="flex items-center">
              {/* Text Size Resizer */}
              <div className="floating-font-controls" title="Resize text inside note">
                <button
                  type="button"
                  className="floating-font-btn"
                  onClick={() => setNoteFontSize((prev) => Math.max(12, prev - 2))}
                  title="Make text smaller"
                >
                  A-
                </button>
                <span className="floating-font-size-label">{noteFontSize}px</span>
                <button
                  type="button"
                  className="floating-font-btn"
                  onClick={() => setNoteFontSize((prev) => Math.min(64, prev + 2))}
                  title="Make text bigger"
                >
                  A+
                </button>
              </div>

              <button
                type="button"
                className="floating-close-btn"
                onClick={() => setShowNote(false)}
                title="Close note"
              >
                ✕
              </button>
            </div>
          </div>
          <textarea
            id="floating-instruction-textarea"
            className="floating-textarea"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            style={{ fontSize: `${noteFontSize}px` }}
            spellCheck={false}
          />
        </div>
      )}
    </div>
  );
}
