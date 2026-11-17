---
name: release
description: Ship a new version of the mobile app to the App Store and Google Play with EAS (version bump, pre-flight checks, commit + tag, build, submit). Use only when the user explicitly asks to release, build for production or submit.
disable-model-invocation: true
argument-hint: "[new version, e.g. 2.2.0]"
---

# Release the mobile app

## Why this order matters

`eas build` uploads the **working tree**, uncommitted changes included. The build page then shows the last commit hash, which does not match what was built. This happened with 2.0.1 and 2.1.0, which were built from uncommitted changes on top of `28e8db8`. Rule: **the tree must be clean and committed before any build**, so that "what is in prod" is always a git tag.

## Steps

Stop and ask the user at each step marked **(confirm)**.

1. **Branch state**
   - `git status` must be clean (except ignored files). Otherwise, ask what to do with the changes.
   - Releases are cut from `master`. If the work is on a feature branch, merge it into `master` first **(confirm)**.
   - `git fetch` and make sure `master` is not behind `origin/master`.
2. **Pre-flight checks**
   - `node scripts/check-i18n.mjs` must pass.
   - If FSEQ/closure code changed since the last tag (`git diff <last-tag>..HEAD --stat -- src/fseqExport.js src/constants.js src/carModels.js`), say so and follow the `fseq-export` skill's verification.
   - If the release needs backend changes, the backend must be deployed **before** the app reaches users (`/deploy-backend`).
3. **Version**
   - Bump `expo.version` in `app.json` (semver: patch = fixes, minor = features). Use the argument if one was given.
   - Build numbers (iOS `buildNumber`, Android `versionCode`) are managed remotely by EAS (`appVersionSource: remote`, `autoIncrement`). Do not edit them.
4. **Commit and tag** **(confirm)**
   - `git commit -am "Release X.Y.Z"`, then `git tag vX.Y.Z`, then `git push origin master --tags`.
5. **Build** **(confirm, this takes hours and uses EAS credits)**
   - `eas build --platform all --profile production`
   - Builds can run in the background. Check them with `eas build:list --limit 4`. Each build's commit must equal the tag's commit.
6. **Submit** **(confirm, this sends the app to store review)**
   - `eas submit --platform ios --latest` and `eas submit --platform android --latest`

## Finding what is in production

`eas build:list --limit 5` gives the version and commit per platform. With this workflow, `git show vX.Y.Z` is exactly that code. Releases before 2.1.0 were not tagged.
