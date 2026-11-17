"""Reference beats / onsets / big moments for the built-in tracks, with librosa.

Independent from the engine's own analysis, used by tests/showMetrics.js.
Usage (from repo root, in a venv with librosa installed):
    python backend/tests/tools/ref_beats.py assets/mp3 backend/tests/fixtures/reference-beats
"""
import sys, json, os, re
import librosa, numpy as np

mp3_dir, out_dir = sys.argv[1], sys.argv[2]
src = open(os.path.join(mp3_dir, 'index.js'), encoding='utf8').read()
for m in re.finditer(r"id:\s*'([^']+)',\s*title:\s*'([^']+)',[\s\S]*?file:\s*require\('\./([^']+\.mp3)'\)", src):
    tid, title, f = m.groups()
    sr = 22050
    hop = 512
    y, sr = librosa.load(os.path.join(mp3_dir, f), sr=sr, mono=True)
    oenv = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    tempo, beats = librosa.beat.beat_track(onset_envelope=oenv, sr=sr, hop_length=hop, units='time')
    onsets = librosa.onset.onset_detect(onset_envelope=oenv, sr=sr, hop_length=hop, units='time')
    tempo = float(np.atleast_1d(tempo)[0])

    # Big moments: sudden loudness jumps (music explodes / comes back after a break).
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    db = librosa.amplitude_to_db(rms, ref=np.max)
    fps = sr / hop
    pre_n, post_n = int(1.0 * fps), int(0.25 * fps)
    med = np.median(db[db > -60]) if np.any(db > -60) else -30
    cands = []
    for i in range(pre_n, len(db) - post_n):
        pre = np.mean(db[i - pre_n:i])
        post = np.mean(db[i:i + post_n])
        if post - pre >= 8 and post >= med:
            cands.append((post - pre, i))
    cands.sort(reverse=True)
    kept = []
    for score, i in cands:
        if all(abs(i - k) > 2 * fps for _, k in kept):
            kept.append((score, i))
    # Snap each jump to the strongest onset within ±150 ms.
    moments = []
    for score, i in sorted(kept, key=lambda x: x[1]):
        lo, hi = max(0, i - int(0.15 * fps)), min(len(oenv), i + int(0.15 * fps))
        j = lo + int(np.argmax(oenv[lo:hi]))
        moments.append({'t': round(j / fps * 1000), 'jump': round(float(score), 1)})

    json.dump({'id': tid, 'bpm': tempo, 'beats': [round(float(b) * 1000) for b in beats],
               'onsets': [round(float(o) * 1000) for o in onsets], 'moments': moments,
               'duration': len(y) / sr}, open(os.path.join(out_dir, tid + '.json'), 'w'))
    print(tid, round(tempo, 1), 'bpm', len(beats), 'beats', len(onsets), 'onsets', len(moments), 'moments', [m['t'] for m in moments])
