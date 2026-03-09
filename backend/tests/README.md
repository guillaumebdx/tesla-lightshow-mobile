# Tests automatisés — Génération de Light Shows

## Lancement rapide

```bash
cd backend
node tests/test-generation.js
```

## Paramètres

| Paramètre | Défaut | Description |
|-----------|--------|-------------|
| `--runs N` | `3` | Nombre de générations consécutives |
| `--prompt "..."` | `"Strobes percutants sur chaque beat, alternance gauche-droite rapide, intensité maximale."` | Prompt utilisateur envoyé au LLM |
| `--judge` | `off` | Active l'évaluation LLM-as-Judge (coût supplémentaire ~$0.001/run via gpt-4.1-nano) |

## Exemples

```bash
# 3 runs avec le prompt par défaut
node tests/test-generation.js

# 1 run rapide pour vérifier un changement
node tests/test-generation.js --runs 1

# Prompt custom
node tests/test-generation.js --prompt "Ambiance chill, respiration douce"

# Avec le judge LLM
node tests/test-generation.js --judge --runs 3

# Combo
node tests/test-generation.js --judge --runs 2 --prompt "Epic cinématique"
```

## Données de test

- **Track** : Jingle Bells (`assets/mp3/the_mountain-jingle-bells-449466.waveform.json`)
- **Durée** : 104s
- **Waveform** : 2000 samples, downsample à 1000 (comme en production)

## Checks déterministes (12)

Chaque run exécute 12 vérifications automatiques avec résultat PASS / WARN / FAIL :

| Check | Description | FAIL si | WARN si |
|-------|-------------|---------|---------|
| `event_count` | Nombre total d'events générés | 0 events | < 200 ou > 5000 |
| `coverage` | % du track couvert par des events | < 80% | < 90% |
| `distribution` | Répartition des events par quart de track | ratio min/max < 0.15 | < 0.35 |
| `variety_parts` | Nombre de parts (zones de la voiture) utilisées | — | < 5 parts |
| `variety_effects` | Mix d'effets solid/blink/easeIn | — | Manque blink ou solid |
| `segment_gaps` | Segments de 10s vides | ≥ 1 segment vide | > 2 segments < 5 events |
| `valid_parts` | Toutes les parts sont des noms Tesla valides | Parts invalides | — |
| `event_integrity` | Timestamps valides (startMs < endMs, pas de NaN) | Events cassés | — |
| `closure_retro` | Limite hardware retros (max 6 roundtrips = 12 events) | — | > 12 events |
| `closure_trunk` | Limite hardware trunk (max 1 séquence = 3 events) | — | > 3 events |
| `closure_flap` | Limite hardware flap (max 1 séquence = 3 events) | — | > 3 events |
| `monotony` | Détecte les répétitions identiques consécutives par part | > 15 identiques | > 8 identiques |

Le script retourne **exit code 1** si au moins un check FAIL.

## LLM-as-Judge (--judge)

Quand activé, un second appel LLM (gpt-4.1-nano) évalue la qualité du show sur 5 critères notés de 1 à 10 :

| Critère | Ce qu'il évalue |
|---------|-----------------|
| `variety` | Diversité des patterns utilisés, absence de répétitivité |
| `coverage` | Couverture complète et homogène du track |
| `musicality` | Adéquation avec la structure musicale |
| `creativity` | Qualité des transitions, du layering, du climax |
| `prompt_adherence` | Respect du prompt utilisateur |

Le judge retourne aussi `strengths` et `issues` en texte libre.

### Quand l'utiliser

- **Sans `--judge`** : après chaque modif de code (patterns, limites, expansion) — rapide, gratuit, déterministe
- **Avec `--judge`** : après une modif du system prompt ou du user prompt — évalue la qualité créative

## Sortie

```
═══════════════════════════════════════════════════════════════
  SUMMARY (3 runs)
═══════════════════════════════════════════════════════════════

  Events:     min=800 avg=1100 max=1400
  Placements: min=90 avg=110 max=130
  Tokens:     min=8000 avg=10000 max=12000
  Cost:       total=$0.0450
  Time:       min=15000ms avg=20000ms max=25000ms
  Checks:     36/36 pass, 0 warn, 0 fail

  LLM Judge averages (3 runs):
    variety            ████████░░ 8.0/10
    coverage           █████████░ 9.0/10
    musicality         ███████░░░ 7.0/10
    creativity         ████████░░ 8.0/10
    prompt_adherence   █████████░ 9.0/10
    overall            ████████░░ 8.2/10
```

## Pré-requis

- Variable d'environnement `OPENAI_API_KEY` dans `backend/.env`
- `npm install` effectué dans `backend/`
