# Node script for [Phrase](https://phrase.com) translation service

## Install

```bash
npm i @blabu.com/phrase-tools
```

## Prune translations

Finds unmentioned keys in remote resources and deletes them so remote contains no extra keys.

### Usage:

1. [Setup your Phrase project](https://help.phrase.com/help/configuration) – create Phrase config file `.phrase.yml` in your project.
2. Run command:

```
# dry run by default
phrase-tools prune

# pass false to make changes
phrase-tools prune --dry-run false
```
