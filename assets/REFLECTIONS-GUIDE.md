# Quranic Reflections: content guide

All the verses and tafsir in LENA's Kerohanian section come from
`assets/reflections.json`. You can add or edit entries there without
touching the code.

## Adding an entry

Copy an existing entry and change every field.

| Field | What goes in it |
|---|---|
| `id` | Unique, no spaces, e.g. `65-2-3` |
| `ref` | How the reference is shown, e.g. `65:2-3` |
| `surah_en`, `surah_ms` | Surah name in English and Malay |
| `themes` | One or more theme ids from the `themes` list at the top |
| `ar` | The Arabic text, copied from a verified mushaf source |
| `en`, `ms` | The translation shown to the user |
| `translation_source` | Which translation `en` and `ms` come from |
| `tafsir` | One or more `{source, en, ms}` items: a short summary of what the named tafsir says |
| `reflect_en`, `reflect_ms` | One or two sentences for the user to sit with (optional) |
| `status` | `draft` until reviewed, then `reviewed` |
| `reviewed_by`, `reviewed_on` | Filled in by the reviewer, e.g. `"Ustaz Ahmad, KIRKHS"`, `"2026-11-20"` |
| `reviewer_note` | Notes for the team. Never shown to users |

A new theme needs an entry in `themes` with an `id`, `en`, `ms` and `icon`.
Themes with no entries are hidden automatically.

## What the reviewer checks

1. The Arabic matches the mushaf exactly.
2. The translation is an approved one, and `translation_source` names it.
3. Each tafsir summary is faithful to the named book, and short. Use a
   summary in your own words or a brief excerpt, not long passages:
   most modern translations and tafsir editions are under copyright.
4. The reflection speaks about people, not about what Allah is doing in
   this user's life. It must not suggest that struggling means weak
   faith, or that more ibadah will fix how someone feels.
5. Nothing reads as telling a struggling person to cope alone.

Only then change `status` to `reviewed`.

## Before a public release

In `index.html`, set `REFL_SHOW_DRAFTS` to `false`. Only reviewed entries
will then appear. While it is `true`, drafts show with a visible Draft
notice, which is fine for testing and demos.

## After every edit

Bump `CACHE_VERSION` in `sw.js` (for example `v17` to `v18`), or people
who have opened LENA before will keep seeing the old file.

## What LENA will not do

The chatbot is not given this content and must never write tafsir of its
own. Verses are not matched to a user's mood automatically; the user
chooses the theme.
