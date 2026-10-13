import { useEffect, useState, type RefObject } from "react";
import { Pause, Play, RotateCcw, RotateCw, Volume2 } from "lucide-react";
import { useWorkbenchStore } from "../../../stores/workbenchStore";

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
  const [loopStart, setLoopStart] = useState<number | null>(null);
  const [loopEnd, setLoopEnd] = useState<number | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);
  const repository = useWorkbenchStore(state => state.repository);
  useEffect(() => {
    let active = true;
    void Promise.all([repository.getSetting("listening.volume"), repository.getSetting("listening.playbackRate")]).then(([storedVolume, storedRate]) => {
      if (!active) return;
      const volume = storedVolume === null ? 1 : Number(storedVolume);
      const rate = storedRate === null ? 1 : Number(storedRate);
      const validVolume = Number.isFinite(volume) && volume >= 0 && volume <= 1 ? volume : 1;
      const validRate = [0.75,1,1.25,1.5,2].includes(rate) ? rate : 1;
      setVolume(validVolume); setRate(validRate);
      if(audioRef.current) { audioRef.current.volume=validVolume; audioRef.current.playbackRate=validRate; }
    }).catch(() => setPlayError("Unable to restore audio preferences."));
    return () => {active=false;};
  }, [repository,audioRef]);
  useEffect(() => {
    if (available && audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.playbackRate = rate;
    }
  }, [audioRef, available, rate, volume]);
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || loopStart === null || loopEnd === null) return;
    const repeat = () => { if (audio.currentTime >= loopEnd) audio.currentTime = loopStart; };
    audio.addEventListener("timeupdate", repeat);
    return () => audio.removeEventListener("timeupdate", repeat);
  }, [audioRef, available, loopStart, loopEnd]);

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
  }, [audioRef, available]);

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
            setPlayError(null);
            if (audio.paused) void audio.play().catch(() => setPlayError("Audio could not start. Check the local resource and retry."));
            else audio.pause();
          }}
          type="button"
        >
          {playing ? <Pause aria-hidden="true" size={16} /> : <Play aria-hidden="true" size={16} />}
          {playing ? "Pause" : "Play"}
        </button>
        {showSkipButtons && <button aria-label="Forward 5 seconds" className="button button--icon" disabled={!available} onClick={() => seekTo(currentTime + 5)} type="button"><RotateCw aria-hidden="true" size={16} /></button>}
        <span className="study-audio__time">{timeLabel(currentTime)} / {timeLabel(duration)}</span>
        <button className="button" disabled={!available} onClick={() => { setLoopStart(audioRef.current?.currentTime ?? currentTime); setLoopEnd(null); }} type="button">{loopStart === null ? "Set A" : `A ${timeLabel(loopStart)}`}</button>
        <button className="button" disabled={!available || loopStart === null || currentTime <= loopStart + 0.25} onClick={() => setLoopEnd(audioRef.current?.currentTime ?? currentTime)} type="button">{loopEnd === null ? "Set B" : `B ${timeLabel(loopEnd)}`}</button>
        {loopStart !== null && <button className="button" onClick={() => { setLoopStart(null); setLoopEnd(null); }} type="button">Clear loop</button>}
        <label className="study-audio__rate">Speed
          <select aria-label="Playback speed" onChange={(event) => {
            const nextRate = Number(event.target.value);
            setRate(nextRate);
            if (audioRef.current) audioRef.current.playbackRate = nextRate;
            void repository.setSetting("listening.playbackRate",String(nextRate)).catch(() => setPlayError("Playback speed could not be saved."));
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
            void repository.setSetting("listening.volume",String(nextVolume)).catch(() => setPlayError("Volume could not be saved."));
          }} step={0.05} type="range" value={volume} />
        </label>
      </div>
      {loopEnd !== null && <small role="status">A–B loop active</small>}
      {playError && <p role="alert">{playError}</p>}
    </div>
  );
}
