import { useEffect, useState, type RefObject } from "react";
import { Pause, Play, RotateCcw, RotateCw, Volume2 } from "lucide-react";

function timeLabel(seconds: number): string {
  if (!Number.isFinite(seconds)) return "00:00";
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

export function StudyAudioControls({ audioRef, available, currentTime, duration, waveform, showSkipButtons, showWaveform }: {
  readonly audioRef: RefObject<HTMLAudioElement | null>;
  readonly available: boolean;
  readonly currentTime: number;
  readonly duration: number;
  readonly waveform: readonly number[];
  readonly showSkipButtons: boolean;
  readonly showWaveform: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [audioRef]);

  const seekTo = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds)) return;
    const maximum = Number.isFinite(audio.duration) ? audio.duration : duration;
    audio.currentTime = Math.max(0, Math.min(maximum || 0, seconds));
  };

  return (
    <div className="study-audio" aria-label="Study audio controls">
      {showWaveform && <div className="study-audio__waveform" aria-label={waveform.length ? "Decoded waveform" : "Waveform unavailable"}>
        {waveform.length > 0 ? waveform.map((height, index) => (
          <i className={index / waveform.length <= progress ? "is-played" : undefined} key={index} style={{ height: `${Math.round(height * 100)}%` }} />
        )) : <span>Waveform will appear when this local audio format can be decoded.</span>}
      </div>}
      <input
        aria-label="Audio position"
        disabled={!available || duration <= 0}
        max={duration || 0}
        min={0}
        onChange={(event) => seekTo(Number(event.target.value))}
        step={0.1}
        type="range"
        value={Math.min(currentTime, duration || 0)}
      />
      <div className="study-audio__controls">
        {showSkipButtons && <button aria-label="Back 5 seconds" className="button button--icon" disabled={!available} onClick={() => seekTo(currentTime - 5)} type="button"><RotateCcw aria-hidden="true" size={16} /></button>}
        <button
          aria-label={playing ? "Pause audio" : "Play audio"}
          className="button study-audio__play"
          disabled={!available}
          onClick={() => {
            const audio = audioRef.current;
            if (!audio) return;
            if (audio.paused) void audio.play();
            else audio.pause();
          }}
          type="button"
        >
          {playing ? <Pause aria-hidden="true" size={16} /> : <Play aria-hidden="true" size={16} />}
          {playing ? "Pause" : "Play"}
        </button>
        {showSkipButtons && <button aria-label="Forward 5 seconds" className="button button--icon" disabled={!available} onClick={() => seekTo(currentTime + 5)} type="button"><RotateCw aria-hidden="true" size={16} /></button>}
        <span className="study-audio__time">{timeLabel(currentTime)} / {timeLabel(duration)}</span>
        <label className="study-audio__rate">Speed
          <select aria-label="Playback speed" onChange={(event) => {
            const nextRate = Number(event.target.value);
            setRate(nextRate);
            if (audioRef.current) audioRef.current.playbackRate = nextRate;
          }} value={rate}>
            {[0.75, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value}>{value}×</option>)}
          </select>
        </label>
        <label className="study-audio__volume"><Volume2 aria-hidden="true" size={15} />
          <span className="sr-only">Volume</span>
          <input aria-label="Volume" max={1} min={0} onChange={(event) => {
            const nextVolume = Number(event.target.value);
            setVolume(nextVolume);
            if (audioRef.current) audioRef.current.volume = nextVolume;
          }} step={0.05} type="range" value={volume} />
        </label>
      </div>
    </div>
  );
}
