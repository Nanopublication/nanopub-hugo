# nanopub-hugo

A Hugo module that turns queries against the [nanopublication network](https://nanopub.net/docs/architecture#overall-architecture)
into a Hugo site.

You declare sections in `hugo.toml`, each one pointing at a **query
nanopublication**. Every result row becomes a real Hugo `Page` — with a
permalink, a date, taxonomy terms, and a link back to the nanopub it came from.
Everything Hugo does with pages, it will now do with your nanopubs: list pages,
term pages, RSS, pagination, search indexes, any theme.

There are no content files. There is no content directory to maintain.

```toml
[[params.nanopub.sections]]
id = 'talks'
title = 'Talks & Events'
query = 'https://w3id.org/np/RAz49FfxC9XaYITrhz_BgNbMO0TVihAFCGv8QpQoizJFg'
[params.nanopub.sections.queryParams]
user = '$ORCID'
[params.nanopub.sections.fields]
title = 'event_label'
date = 'date'
link = 'event'
```

That block produces `/talks/` and a page per event.

## Requirements

- Hugo **0.146.0 or later**, extended not required.
- Go, if you install this as a Hugo module (`hugo mod` shells out to it). No Go
  needed if you vendor it as a theme — see below.

## Install

As a module:

```sh
hugo mod init github.com/you/your-site
hugo mod get github.com/Nanopublication/nanopub-hugo
```

```toml
[[module.imports]]
path = 'github.com/Nanopublication/nanopub-hugo'
```

Or, with no Go toolchain, as a theme:

```sh
git clone https://github.com/Nanopublication/nanopub-hugo themes/nanopub-hugo
```

```toml
theme = 'nanopub-hugo'
```

## Required site configuration

**Three settings must live in your own `hugo.toml`.** Hugo deliberately refuses
to let a module widen a host site's security policy, so this module cannot
supply them for you. Leaving them out is the most common way this module fails,
so the adapter detects the first case and tells you exactly what to paste.

```toml
# 1. resources.GetRemote rejects any media type not on this allowlist.
#    Do NOT anchor these with $ — responses carry a ";charset=UTF-8" suffix,
#    and '^application/sparql-results\+json$' therefore never matches.
[security.http]
mediaTypes = ['^application/ld\+json', '^application/sparql-results\+json']
```

```toml
# 2. Only if a section sets contentMediaType = 'text/html'. Hugo denies raw
#    HTML from a content adapter by default, which is the right default for
#    content coming off an open network. See "Body content" below.
[security]
allowContent = ['^text/html$', '^text/markdown$']
```

The third is not security but is easy to miss: declare any `taxonomies` you map
to, or Hugo silently ignores the terms.

```toml
[taxonomies]
venue = 'venues'
role = 'roles'
```

## Configuring sections

```toml
[params.nanopub]
endpoint = 'https://query.nanodash.net/'
nanodash = 'https://nanodash.net/'
orcid = 'https://orcid.org/0000-0001-8492-0354'
verbose = true                      # log row counts per section during builds

[[params.nanopub.sections]]
id = 'publications'                 # required; becomes the section path
title = 'Publications'
blurb = 'Papers I have authored.'
empty = 'Nothing published yet.'    # shown when the query returns no rows
weight = 1
mode = 'static'                     # 'static' (default) or 'live'
query = 'https://w3id.org/np/RA-SYwh12YqSOePu9OX9VD94KVuoG69ddkE4XET_zJShY'

[params.nanopub.sections.queryParams]
author = '$ORCID'

[params.nanopub.sections.fields]
title = 'paper_label'               # required in practice; rows without it are skipped
date = 'publication_date'
link = 'paper'                      # → .Params.source
summary = 'journal_label'           # → .Params.summary
content = 'abstract'                # → the page body

[params.nanopub.sections.taxonomies]
venues = 'journal_label'            # taxonomy name → query variable
```

`query` accepts either form:

| Form | Example |
| --- | --- |
| Nanopub URI | `https://w3id.org/np/RA-SYwh12YqSOePu9OX9VD94KVuoG69ddkE4XET_zJShY` |
| Query template id | `RA-SYwh12YqSOePu9OX9VD94KVuoG69ddkE4XET_zJShY/get-papers-for-author` |

Given a URI, the module fetches the nanopub as JSON-LD, finds the node typed
`grlc:grlc-query`, and derives the id from its `@id`. Both separators seen in
the wild are handled — some nanopubs serialise the query node as
`<...RAxxx/name>`, others as `<...RAxxx#name>`.

`$ORCID` and `$PUBKEYS` in `queryParams` are substituted from `params.nanopub`.

To find a query's variable names, run it once:

```sh
curl -s -G 'https://query.nanodash.net/api/<query-id>' \
  --data-urlencode 'author=https://orcid.org/0000-...' \
  -H 'Accept: application/sparql-results+json' | jq '.head.vars'
```

## What each page gets

| | |
| --- | --- |
| `.Title` | the `fields.title` variable |
| `.Date` | the `fields.date` variable, parsed |
| `.Content` | the `fields.content` variable |
| `.Params.nanopub` | URI of the source nanopublication |
| `.Params.source` | the `fields.link` variable |
| `.Params.summary` | the `fields.summary` variable |
| `.Params.row` | **every** binding, so a layout can reach a variable the config never named |
| `.Params.section` | the section id |
| `.Params.queryId` | the resolved query template id |

## Profile

`nanopub/profile.html` returns the facts the network already knows about
`params.nanopub.orcid`, using the same well-known queries Nanodash uses for its
user pages — so a personal site need not hand-maintain them:

```go-html-template
{{ $p := partial "nanopub/profile.html" . }}
{{ with $p.photo }}<img class="avatar" src="{{ . }}" alt="" />{{ end }}
<h1>{{ $p.name }}</h1>
{{ with $p.stats.validNpCount }}<p>{{ . }} valid nanopublications</p>{{ end }}
```

Fields: `name`, `photo`, `intro`, `pubkeyHashes`, `pubkeys`, `stats`. Anything
set under `params.nanopub.profile` overrides what the network says.

## Static and live

`mode = 'static'` (the default) fetches at build time and produces real pages —
indexable, fast, no JavaScript.

`mode = 'live'` produces the section page only; the rows are queried in the
visitor's browser by [nanopub-elements](https://github.com/Nanopublication/nanopub-elements).
Use it where freshness beats indexability. In a layout:

```go-html-template
{{ if eq .Params.mode "live" }}
  {{ partial "nanopub/live.html" (dict "section" .Params.section) }}
{{ end }}
```

Or anywhere in page content, via shortcode:

```go-html-template
{{< nanopub-list section="activity" >}}
{{< nanopub-table section="projects" >}}
{{< nanopub-list query="RA.../get-x" params="{...}" titleField="label" limit="5" >}}
```

Nothing stops you doing both: a static section for the archive, a live shortcode
on the front page for what changed this week.

## Body content

Fields that carry markup need an explicit decision, because this is markup from
an open network and nothing here sanitises it.

| Setting | Result |
| --- | --- |
| *(default)* | `text/markdown`; Goldmark escapes raw HTML unless the site enables `unsafe` |
| `contentPlain = true` | tags stripped, words kept, no security config needed |
| `contentMediaType = 'text/html'` | markup preserved — requires the `allowContent` opt-in above |

Choose the third only for spaces whose publishers you trust.

## Dates

`fields.date` accepts any granularity the network hands back — `2008`,
`2008-05`, `2008-05-17`, `2026-08-21T10:50:40.128Z` — normalising the first two
before parsing. Roughly half the rows in the public publications query are
year-only, and `time.AsTime` fails the whole build on those. A value that is not
a date at all leaves the page undated rather than breaking the build.

## Caching and offline builds

`resources.GetRemote` results go into Hugo's file cache, so warm rebuilds are
near-instant and builds succeed with the network unavailable. Tune it:

```toml
[caches.getresource]
dir = ':cacheDir/:project'
maxAge = '4h'
```

For a nightly rebuild in CI, cache the `resources/_gen` and Hugo cache
directories between runs so a network failure degrades to stale content rather
than a failed build.

A query that *fails* aborts the build with an error rather than emitting an
empty section — a deployed empty site is worse than a red build. A query that
succeeds and legitimately returns nothing renders the section's `empty` message.

## Example sites

`exampleSite/` is the minimal demonstration: three sections, no personal data,
and no query parameters — every query it uses is public and takes no arguments,
so it builds for anyone. Two static sections (one with a taxonomy) and one live
section, 111 pages.

```sh
cd exampleSite && hugo server
```

## Overriding

- **One section, your own way**: add `content/<id>/_content.gotmpl` to your site.
  A site-level adapter wins over the module's for that directory.
- **Everything**: add `content/_content.gotmpl` to your site to replace the
  module's adapter entirely. The partials (`nanopub/resolve-query.html`,
  `nanopub/run-query.html`) remain available on their own.

## Known limits

- **Parameters are fixed at build time.** A section is one query with one set of
  arguments. Faceting or search needs a live element or a client-side index.
- **Slugs come from titles.** Two rows with the same title get the second
  disambiguated by nanopub artifact code. Retitling a nanopub changes its URL.
- **`Site.Pages` is unavailable inside the adapter**, by Hugo's design — pages
  do not exist yet. Cross-section logic belongs in layouts.
- **Sections are fetched serially.** Fine for a handful; noticeable at dozens.
