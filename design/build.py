#!/usr/bin/env python3
"""Assemble the design-canvas artboards from shared CSS + per-screen bodies.

Run from anywhere: writes design/canvas/*.dc.html and canvas.json.
"""
import json, pathlib

OUT = pathlib.Path(__file__).parent / "canvas"
OUT.mkdir(exist_ok=True)

FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap">'

CSS = """
:root{--bg:#F7F6F2;--surface:#FFFFFF;--surface-2:#F1F0EB;--ink:#1B1D1F;--ink-2:#5A6067;--ink-3:#8B9096;--line:#E7E5DF;
--accent:#0E8C86;--on-accent:#FFFFFF;--accent-soft:#DFF2F0;--ext:#B85C1E;--ext-soft:#FBEDE3;--danger:#C2410C;
--s1:#2F8F9D;--s2:#B0752E;--s3:#8A6BB5;--s4:#4F9A5B;--scrim:rgba(20,22,24,.45)}
.dark{--bg:#121415;--surface:#1B1E20;--surface-2:#22262A;--ink:#F2F1EC;--ink-2:#A9AFB5;--ink-3:#737980;--line:#2A2E31;
--accent:#3FBDB4;--on-accent:#0E1F1E;--accent-soft:#163A38;--ext:#E08A4F;--ext-soft:#3A2416;--danger:#F0865A;
--s1:#5FB6C2;--s2:#D3A15A;--s3:#B39AD8;--s4:#7BC287;--scrim:rgba(0,0,0,.6)}
*{box-sizing:border-box}
body{margin:0;background:transparent}
a{color:var(--accent)} a:hover{color:var(--ink)}
.app{width:390px;height:844px;overflow:hidden;position:relative;background:var(--bg);color:var(--ink);
font-family:'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.45;-webkit-font-smoothing:antialiased}
.mono{font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums}
.status{height:54px}
.home{height:34px}
.h1{font-size:28px;font-weight:800;letter-spacing:-.02em;line-height:1.15}
.h2{font-size:20px;font-weight:700;letter-spacing:-.01em;line-height:1.2}
.h3{font-size:16px;font-weight:700;line-height:1.3}
.cap{font-size:12px;font-weight:600;color:var(--ink-3);letter-spacing:.04em;text-transform:uppercase}
.sub{font-size:13px;color:var(--ink-2)}
.muted{color:var(--ink-3)}
.row{display:flex;align-items:center;gap:12px}
.col{display:flex;flex-direction:column;gap:8px}
.grow{flex-grow:1}
.px{padding-left:20px;padding-right:20px}
.icon{width:20px;height:20px;flex-shrink:0;stroke:currentColor;fill:none;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
.icon24{width:24px;height:24px;flex-shrink:0;stroke:currentColor;fill:none;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
.iconbtn{width:44px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:12px;color:var(--ink)}
.chip{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:var(--surface);font-size:13px;font-weight:600;color:var(--ink-2);white-space:nowrap}
.chip.on{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.tag{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:6px;font-size:12px;font-weight:600}
.tag.ext{background:var(--ext-soft);color:var(--ext)}
.tag.int{background:var(--accent-soft);color:var(--accent)}
.tag.plain{background:var(--surface-2);color:var(--ink-2)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:16px}
.field{display:flex;align-items:center;gap:10px;height:44px;padding:0 14px;border-radius:12px;background:var(--surface-2);color:var(--ink-3);font-size:15px}
.seg{display:flex;gap:4px;padding:4px;border-radius:12px;background:var(--surface-2)}
.seg div{flex:1;height:34px;display:flex;align-items:center;justify-content:center;border-radius:9px;font-size:13px;font-weight:600;color:var(--ink-2)}
.seg .on{background:var(--surface);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.btn{display:flex;align-items:center;justify-content:center;gap:8px;height:50px;border-radius:14px;background:var(--accent);color:var(--on-accent);font-weight:700;font-size:16px}
.btn.ghost{background:var(--surface);color:var(--ink);border:1px solid var(--line)}
.avatar{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0}
.thumb{width:72px;height:48px;border-radius:8px;background:linear-gradient(135deg,#2B3036,#5B6470);flex-shrink:0;position:relative;overflow:hidden}
.thumb::after{content:"";position:absolute;inset:auto 6px 6px auto;width:10px;height:10px;border-radius:50%;background:var(--accent)}
.ts{display:inline-flex;align-items:center;height:24px;padding:0 8px;border-radius:6px;background:var(--surface-2);color:var(--ink-2);font-size:12px;font-weight:500}
.hr{height:1px;background:var(--line)}
.tabbar{position:absolute;left:0;right:0;bottom:0;background:var(--surface);border-top:1px solid var(--line);padding:8px 8px 34px;display:flex}
.tabbar div{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:48px;justify-content:center;font-size:11px;font-weight:600;color:var(--ink-3)}
.tabbar .on{color:var(--accent)}
.mini{position:absolute;left:12px;right:12px;bottom:98px;height:60px;border-radius:14px;background:var(--ink);color:var(--bg);display:flex;align-items:center;gap:12px;padding:0 10px 0 10px;box-shadow:0 8px 24px rgba(0,0,0,.18)}
.mini .bar{position:absolute;left:14px;right:14px;bottom:0;height:2px;background:rgba(255,255,255,.2)}
.mini .bar i{display:block;height:2px;width:38%;background:var(--accent)}
.scrub{height:4px;border-radius:2px;background:var(--line);position:relative}
.scrub i{position:absolute;left:0;top:0;height:4px;border-radius:2px;background:var(--accent)}
.scrub b{position:absolute;top:-5px;width:14px;height:14px;border-radius:50%;background:var(--accent);margin-left:-7px}
.bullet{display:flex;gap:10px;align-items:flex-start}
.bullet::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--ink-3);margin-top:9px;flex-shrink:0}
.check{width:22px;height:22px;border-radius:7px;border:1.75px solid var(--ink-3);flex-shrink:0;margin-top:1px}
.check.done{background:var(--accent);border-color:var(--accent)}
.sheet{position:absolute;left:0;right:0;bottom:0;background:var(--surface);border-radius:20px 20px 0 0;padding:8px 20px 34px}
.grab{width:36px;height:4px;border-radius:2px;background:var(--line);margin:4px auto 16px}
.sk{border-radius:6px;background:var(--surface-2)}
.tt{display:flex;align-items:center;gap:8px;height:44px}
.tt.on{color:var(--ink);border-bottom:2px solid var(--ink)}
.hl{color:var(--ink);font-weight:700}
"""

I = {
 "search":'<path d="M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z"/><path d="M20 20l-3.5-3.5"/>',
 "sliders":'<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
 "play":'<path d="M7 5v14l12-7z" fill="currentColor" stroke="none"/>',
 "pause":'<path d="M8 5v14M16 5v14" stroke-width="3"/>',
 "back10":'<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8"/><path d="M4 3v5h5"/><path d="M10 15v-5l-1.5 1M14.5 15c1 0 1.5-.8 1.5-2.5S15.5 10 14.5 10 13 10.8 13 12.5s.5 2.5 1.5 2.5z"/>',
 "fwd10":'<path d="M20 12a8 8 0 1 1-2.3-5.7L20 8"/><path d="M20 3v5h-5"/><path d="M10 15v-5l-1.5 1M14.5 15c1 0 1.5-.8 1.5-2.5S15.5 10 14.5 10 13 10.8 13 12.5s.5 2.5 1.5 2.5z"/>',
 "chev":'<path d="M9 6l6 6-6 6"/>',
 "chevd":'<path d="M6 9l6 6 6-6"/>',
 "back":'<path d="M15 6l-6 6 6 6"/>',
 "share":'<path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/>',
 "download":'<path d="M12 3v12M8 11l4 4 4-4"/><path d="M5 19h14"/>',
 "tag":'<path d="M3 11V4h7l10 10-7 7z"/><circle cx="7.5" cy="8.5" r="1.2" fill="currentColor" stroke="none"/>',
 "link":'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/>',
 "people":'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4.5-6.2"/>',
 "cal":'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
 "more":'<circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none"/>',
 "video":'<rect x="3" y="6" width="13" height="12" rx="3"/><path d="M16 10l5-3v10l-5-3z"/>',
 "pip":'<rect x="3" y="5" width="18" height="14" rx="3"/><rect x="12" y="11" width="7" height="5" rx="1.5" fill="currentColor" stroke="none"/>',
 "gear":'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
 "clips":'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1l3.9 3.9"/>',
 "list":'<path d="M4 6h16M4 12h16M4 18h10"/>',
 "mic":'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
 "text":'<path d="M4 6h16M4 10h16M4 14h10M4 18h7"/>',
 "bars":'<path d="M4 20V10M10 20V4M16 20v-7M22 20v-3"/>',
 "check":'<path d="M5 12l5 5L20 7"/>',
 "x":'<path d="M6 6l12 12M18 6L6 18"/>',
 "ext":'<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
 "grain":'<circle cx="12" cy="12" r="9"/><path d="M12 7v10M8 10v4M16 10v4"/>',
 "key":'<circle cx="8" cy="14" r="4"/><path d="M11 11l9-9M16 4l3 3M13 7l3 3"/>',
 "wifi":'<path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>',
 "clock":'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 "speed":'<path d="M4 14a8 8 0 1 1 16 0"/><path d="M12 14l4-5"/><circle cx="12" cy="14" r="1.5" fill="currentColor" stroke="none"/>',
 "copy":'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>',
 "screen":'<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>',
}
def ic(n, cls="icon"): return f'<svg class="{cls}" viewBox="0 0 24 24" aria-hidden="true">{I[n]}</svg>'

def shell(body, props='{"theme":{"editor":"enum","options":["light","dark"],"default":"light","section":"Theme"}}', logic=None, extra_css=""):
    logic = logic or "class Component extends DCLogic { renderVals(){ return { root: (this.props.theme ?? 'light')==='dark' ? 'dark' : '' }; } }"
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  {FONTS}
  <style>{CSS}{extra_css}</style>
</helmet>
<div class="app {{{{root}}}}">
{body}
</div>
</x-dc>
<script data-dc-script data-props='{props}'>
{logic}
</script>
</body>
</html>
"""

def tabbar(active):
    items = [("Meetings","video"),("Search","search"),("Clips","clips"),("Settings","gear")]
    return '<div class="tabbar">' + "".join(
        f'<div class="{"on" if n==active else ""}">{ic(i,"icon24")}<span>{n}</span></div>' for n,i in items) + '</div>'

def mini():
    return f'''<div class="mini">
  <div class="thumb" style="width:44px;height:44px;border-radius:10px"></div>
  <div class="grow" style="min-width:0">
    <div style="font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Trey Research / Relecloud: Demo + POV Discussion</div>
    <div class="mono" style="font-size:12px;opacity:.7">16:42 · 44:01</div>
  </div>
  <div class="iconbtn" style="color:var(--bg)">{ic("back10","icon24")}</div>
  <div class="iconbtn" style="color:var(--bg)">{ic("pause","icon24")}</div>
  <div class="bar"><i></i></div>
</div>'''

def mrow(title, meta, company, scope, n, recurring=False):
    return f'''<div class="row" style="padding:12px 20px;gap:14px">
  <div class="thumb"></div>
  <div class="grow col" style="gap:4px;min-width:0">
    <div style="font-size:15px;font-weight:700;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{title}</div>
    <div class="row" style="gap:8px"><span class="sub mono" style="font-size:12px">{meta}</span><span class="tag {scope}">{'External' if scope=='ext' else 'Internal'}</span></div>
  </div>
  <div class="col" style="align-items:flex-end;gap:6px">
    <span class="tag plain">{company}</span>
    <span class="row sub" style="gap:4px;font-size:12px">{ic("people")}{n}</span>
  </div>
</div>'''

def dayhead(t): return f'<div class="cap px" style="padding-top:18px;padding-bottom:4px">{t}</div>'

# ---------------------------------------------------------------- Screens
SIGNIN = f'''
<div class="status"></div>
<div class="px col" style="gap:0;height:790px">
  <div class="row" style="gap:10px;margin-top:40px"><div style="width:44px;height:44px;border-radius:14px;background:var(--ink);color:var(--bg);display:flex;align-items:center;justify-content:center">{ic("grain","icon24")}</div><div class="h2">Grist</div></div>
  <div class="h1" style="margin-top:56px">Your meetings,<br>on your phone.</div>
  <div class="sub" style="font-size:16px;margin-top:12px;line-height:1.5">Listen to recordings, read AI notes and follow transcripts from your Grain workspace.</div>
  <div class="col" style="gap:8px;margin-top:44px">
    <div style="font-size:13px;font-weight:600;color:var(--ink-2)">Personal access token</div>
    <div class="field" style="height:52px;background:var(--surface);border:1.5px solid var(--accent);color:var(--ink)">{ic("key")}<span class="mono grow">grain_pat_••••••••••••••••</span><span style="font-size:13px;font-weight:700;color:var(--accent)">Paste</span></div>
    <div class="sub" style="font-size:12px">Stored in the device keychain. Only sent to api.grain.com.</div>
  </div>
  <div class="btn" style="margin-top:20px">Continue</div>
  <div class="card row" style="margin-top:28px;padding:14px;gap:12px">
    <div style="width:36px;height:36px;border-radius:10px;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center">{ic("ext")}</div>
    <div class="grow"><div style="font-size:14px;font-weight:700">Where do I get a token?</div><div class="sub" style="font-size:12px">Grain › Account settings › Integrations › Personal API</div></div>
    {ic("chev")}
  </div>
  <div class="grow"></div>
  <div class="sub" style="font-size:12px;text-align:center;padding-bottom:8px">Open source · Not affiliated with Grain</div>
</div>
<div class="home"></div>
'''

MEETINGS = f'''
<div class="status"></div>
<div class="px row" style="height:52px"><div class="h1 grow">Meetings</div><div class="iconbtn">{ic("sliders","icon24")}</div></div>
<div class="px" style="padding-top:6px"><div class="field">{ic("search")}<span>Filter by title</span></div></div>
<div class="row" style="gap:8px;padding:12px 20px 4px;overflow:hidden">
  <span class="chip on">Mine</span><span class="chip">Workspace</span><span class="chip">Sales</span><span class="chip">Ines's Works…</span>
</div>
<div class="row" style="gap:8px;padding:8px 20px 6px;overflow:hidden">
  <span class="chip" style="height:28px;font-size:12px;background:var(--accent-soft);color:var(--accent);border-color:transparent">{ic("check")}External</span>
  <span class="chip" style="height:28px;font-size:12px">Last 30 days {ic("chevd")}</span>
  <span class="chip" style="height:28px;font-size:12px">Meeting type {ic("chevd")}</span>
</div>
{dayhead("Today")}
{mrow("Trey Research / Relecloud: Demo + POV Discussion","1:01 AM · 44m","Relecloud","ext",4)}
{dayhead("Yesterday")}
{mrow("Trey Research &amp; FABRIKAM","8:01 PM · 26m","Fabrikam","ext",5)}
<div class="hr" style="margin-left:106px"></div>
{mrow("Trey Research Demo for Theo &amp; Jordan","6:01 PM · 1h 7m","Litware","ext",5)}
<div class="hr" style="margin-left:106px"></div>
{mrow("Platform Team Daily","10:15 AM · 22m","Trey Research","int",8)}
{dayhead("Thursday, Sep 3")}
{mrow("Trey Research Integration call (Round 2)","11:01 PM · 16s","Adatum","ext",6)}
<div class="hr" style="margin-left:106px"></div>
{mrow("Wingtip ⟷ Trey Research (Weekly POV check-in)","7:58 PM · 33m","Wingtip","ext",12)}
{mini()}
{tabbar("Meetings")}
'''

FILTERS = f'''
<div style="position:absolute;inset:0;background:var(--scrim)"></div>
<div class="sheet" style="height:640px">
  <div class="grab"></div>
  <div class="row"><div class="h2 grow">Filters</div><span style="font-size:14px;font-weight:600;color:var(--accent)">Reset</span></div>
  <div class="col" style="gap:22px;margin-top:20px">
    <div class="col"><div class="cap">Scope</div><div class="seg"><div>All</div><div class="on">External</div><div>Internal</div></div></div>
    <div class="col"><div class="cap">Date</div><div class="row" style="gap:8px;flex-wrap:wrap"><span class="chip">7 days</span><span class="chip on">30 days</span><span class="chip">90 days</span><span class="chip">{ic("cal")}Custom</span></div></div>
    <div class="col"><div class="cap">Meeting type</div><div class="row" style="gap:8px;flex-wrap:wrap"><span class="chip on">Sales</span><span class="chip">Customer success</span><span class="chip">Interview</span><span class="chip">Project &amp; team</span></div></div>
    <div class="col"><div class="cap">Team</div><div class="row" style="gap:8px;flex-wrap:wrap"><span class="chip">Sales</span><span class="chip">Ines Marin's Workspace</span></div></div>
    <div class="col">
      <div class="cap">More</div>
      <div class="card col" style="gap:0">
        <div class="row" style="height:48px;padding:0 14px">{ic("people")}<span class="grow" style="font-weight:600">Participant</span><span class="sub">Any</span>{ic("chev")}</div>
        <div class="hr" style="margin-left:44px"></div>
        <div class="row" style="height:48px;padding:0 14px">{ic("tag")}<span class="grow" style="font-weight:600">Tag</span><span class="sub">Any</span>{ic("chev")}</div>
        <div class="hr" style="margin-left:44px"></div>
        <div class="row" style="height:48px;padding:0 14px">{ic("mic")}<span class="grow" style="font-weight:600">Recorder</span><span class="sub">Any</span>{ic("chev")}</div>
      </div>
    </div>
  </div>
  <div class="btn" style="margin-top:24px">Show 42 meetings</div>
</div>
'''

def player_top(mode="video"):
    return f'''
<div class="status"></div>
<div class="px row" style="height:48px"><div class="iconbtn" style="margin-left:-12px">{ic("back","icon24")}</div><div class="grow"></div><div class="iconbtn">{ic("share","icon24")}</div><div class="iconbtn" style="margin-right:-12px">{ic("more","icon24")}</div></div>
<div class="px">
  <div style="height:208px;border-radius:16px;background:linear-gradient(160deg,#23282D,#3C444C);position:relative;overflow:hidden;color:#fff">
    <div style="position:absolute;left:14px;top:12px;right:14px;display:flex;justify-content:space-between;align-items:center"><span class="tag" style="background:rgba(255,255,255,.14);color:#fff">1.5×</span><div class="row" style="gap:4px"><div class="iconbtn" style="width:36px;height:36px;color:#fff">{ic("pip")}</div></div></div>
    <div style="position:absolute;left:0;right:0;top:78px;display:flex;justify-content:center;gap:28px;align-items:center;color:#fff">
      {ic("back10","icon24")}<div style="width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.92);color:#1B1D1F;display:flex;align-items:center;justify-content:center">{ic("pause","icon24")}</div>{ic("fwd10","icon24")}
    </div>
    <div style="position:absolute;left:14px;right:14px;bottom:14px">
      <div class="scrub" style="background:rgba(255,255,255,.25)"><i style="width:38%"></i><b style="left:38%;background:#fff"></b></div>
      <div class="row mono" style="justify-content:space-between;font-size:11px;margin-top:8px;opacity:.85"><span>16:42</span><span>44:01</span></div>
    </div>
  </div>
</div>
<div class="px" style="padding-top:14px">
  <div class="h2" style="line-height:1.25">Trey Research / Relecloud: Demo + POV Discussion</div>
  <div class="row" style="gap:6px;margin-top:10px;flex-wrap:wrap">
    <span class="tag plain">{ic("cal")}&nbsp;Sep 5</span><span class="tag plain">Sales</span><span class="tag ext">External</span><span class="tag plain">{ic("people")}&nbsp;Mia Duarte +3</span>
  </div>
</div>
'''

def tabs(active):
    names=["Summary","Transcript","Timeline","Clips"]
    badge='&nbsp;<span class="tag plain" style="height:18px;padding:0 6px">1</span>'
    out=[]
    for n in names:
        cls = "on" if n==active else "muted"
        out.append(f'<div class="tt {cls}" style="font-weight:700;font-size:14px">{n}{badge if n=="Clips" else ""}</div>')
    return '<div class="px row" style="gap:22px;margin-top:10px;border-bottom:1px solid var(--line)">' + "".join(out) + '</div>'

SUMMARY = player_top() + tabs("Summary") + f'''
<div class="px col" style="gap:18px;padding-top:16px">
  <div class="col" style="gap:10px">
    <div class="cap">Action items</div>
    <div class="row" style="gap:8px"><div class="avatar" style="background:var(--s1);width:24px;height:24px;font-size:10px">MK</div><span style="font-size:13px;font-weight:600">Marcus Kowalski</span><span class="sub">· Trey Research</span></div>
    <div class="row" style="gap:10px;align-items:flex-start"><div class="check"></div><div class="grow" style="font-size:15px">Send cloud-workload measurement requirements and pricing</div><span class="ts mono">42:12</span></div>
    <div class="row" style="gap:10px;align-items:flex-start"><div class="check done" style="color:var(--on-accent);display:flex;align-items:center;justify-content:center">{ic("check")}</div><div class="grow" style="font-size:15px;color:var(--ink-2)">Share full list of supported integrations</div><span class="ts mono">17:04</span></div>
    <div class="row" style="gap:8px"><div class="avatar" style="background:var(--s3);width:24px;height:24px;font-size:10px">NW</div><span style="font-size:13px;font-weight:600">Noa Whitfield</span><span class="sub">· Trey Research</span></div>
    <div class="row" style="gap:10px;align-items:flex-start"><div class="check"></div><div class="grow" style="font-size:15px">Confirm the EDR data visibility for the POV</div><span class="ts mono">36:36</span></div>
  </div>
  <div class="col" style="gap:10px">
    <div class="cap">Summary</div>
    <div class="bullet"><div class="grow" style="font-size:15px">Relecloud (120-person B2B support company) has no SIEM, no 24/7 monitoring, and a lean security team led by <b>Mia Duarte</b>.</div><span class="ts mono">1:28</span></div>
    <div class="bullet"><div class="grow" style="font-size:15px"><b>Trey Research</b> positioned its managed agentic security model as a blend of AI-driven triage and senior human response.</div><span class="ts mono">10:14</span></div>
    <div class="bullet"><div class="grow" style="font-size:15px">Mia Duarte wants to run a POV with AWS, Google Workspace and the EDR integrations, targeting early October.</div><span class="ts mono">42:29</span></div>
  </div>
</div>
'''

def line(sp, col, initials, t, text, cur=False):
    return f'''<div class="row" style="gap:12px;align-items:flex-start;padding:10px 20px;{"background:var(--accent-soft);" if cur else ""}">
  <div class="avatar" style="background:{col};width:28px;height:28px;font-size:11px;margin-top:2px">{initials}</div>
  <div class="grow col" style="gap:2px"><div class="row" style="gap:8px"><span style="font-size:13px;font-weight:700;color:{col}">{sp}</span><span class="mono sub" style="font-size:11px">{t}</span></div><div style="font-size:15px;line-height:1.5">{text}</div></div>
</div>'''

TRANSCRIPT = player_top() + tabs("Transcript") + f'''
<div class="px row" style="gap:10px;padding-top:12px"><div class="field grow" style="height:40px">{ic("search")}<span>Search transcript</span></div><span class="chip on" style="height:40px">{ic("text")}Follow</span></div>
<div style="padding-top:8px">
{line("Marcus Kowalski","var(--s1)","EB","16:31","So the way we think about ingestion is: you connect the point solutions directly, or through a SIEM if you already have one.")}
{line("Relecloud","var(--s2)","AS","16:42","Got it. And does the filtering happen on our side or yours?",True)}
{line("Noa Whitfield","var(--s3)","OL","16:55","On ours. If something is noisy the SOC pushes a change, it's not a self-serve toggle today.")}
{line("Marcus Kowalski","var(--s1)","EB","17:04","And to be clear, ingestion cost isn't a concern for you because we don't price by volume.")}
</div>
'''

def bar(name, col, pct, mins, segs):
    s = "".join(f'<i style="left:{a}%;width:{w}%;background:{col}"></i>' for a,w in segs)
    return f'''<div class="col" style="gap:6px">
  <div class="row"><div class="avatar" style="background:{col};width:22px;height:22px;font-size:9px">{name[:1]}</div><span class="grow" style="font-size:14px;font-weight:600">{name}</span><span class="mono sub" style="font-size:12px">{pct}% · {mins}</span></div>
  <div style="height:8px;border-radius:4px;background:var(--surface-2);position:relative;overflow:hidden">{s}</div>
</div>'''

TIMELINE = player_top() + tabs("Timeline") + f'''
<div class="px col" style="gap:14px;padding-top:16px">
  <div class="cap">Talk time</div>
  {bar("Marcus Kowalski","var(--s1)",37,"16m",[(2,6),(11,9),(24,4),(31,12),(50,3),(60,8),(75,5),(88,7)])}
  {bar("Noa Whitfield","var(--s3)",37,"16m",[(9,2),(20,4),(35,14),(53,6),(68,7),(82,5),(95,4)])}
  {bar("Relecloud (Mia)","var(--s2)",20,"8m",[(0,2),(8,3),(17,2),(28,3),(44,6),(56,4),(66,2),(80,2),(93,2)])}
  <div class="col" style="gap:6px"><div class="row">{ic("screen")}<span class="grow" style="font-size:14px;font-weight:600">Screenshare</span><span class="mono sub" style="font-size:12px">31 min</span></div>
  <div style="height:8px;border-radius:4px;background:var(--surface-2);position:relative;overflow:hidden"><i style="position:absolute;top:0;bottom:0;left:15%;width:32%;background:var(--ink-3)"></i><i style="position:absolute;top:0;bottom:0;left:48%;width:38%;background:var(--ink-3)"></i></div></div>
  <div class="cap" style="margin-top:6px">Participants · 4</div>
  <div class="card col" style="gap:0">
    <div class="row" style="height:52px;padding:0 14px"><div class="avatar" style="background:var(--s1);width:30px;height:30px;font-size:11px">MK</div><div class="grow"><div style="font-size:14px;font-weight:600">Marcus Kowalski</div><div class="sub" style="font-size:12px">marcus.kowalski@treyresearch.example · recorder</div></div><span class="tag int">Internal</span></div>
    <div class="hr" style="margin-left:58px"></div>
    <div class="row" style="height:52px;padding:0 14px"><div class="avatar" style="background:var(--s2);width:30px;height:30px;font-size:11px">MD</div><div class="grow"><div style="font-size:14px;font-weight:600">Mia Duarte</div><div class="sub" style="font-size:12px">relecloud.example</div></div><span class="tag ext">External</span></div>
  </div>
</div>
'''

CLIPS_TAB = player_top() + tabs("Clips") + f'''
<div class="px col" style="gap:12px;padding-top:16px">
  <div class="card row" style="padding:12px;gap:12px"><div class="thumb" style="width:96px;height:64px;border-radius:10px"><span class="mono" style="position:absolute;left:6px;bottom:6px;font-size:11px;color:#fff;background:rgba(0,0,0,.55);padding:1px 5px;border-radius:4px">0:46</span></div><div class="grow"><div style="font-size:14px;font-weight:700;line-height:1.35">Felix questions SIEM alerts; prefers consolidating investigations in Google SecOps</div><div class="sub mono" style="font-size:11px;margin-top:4px">starts 23:18 · Marcus Kowalski, Relecloud</div></div></div>
  <div class="sub" style="font-size:13px;text-align:center;padding:12px 24px 0">Clips are created in Grain. <span style="color:var(--accent);font-weight:600">Open this meeting in Grain</span> to add one.</div>
</div>
'''

AUDIO = f'''
<div class="status"></div>
<div class="px row" style="height:48px"><div class="iconbtn" style="margin-left:-12px">{ic("chevd","icon24")}</div><div class="grow cap" style="text-align:center">Now playing</div><div class="iconbtn" style="margin-right:-12px">{ic("more","icon24")}</div></div>
<div class="px col" style="align-items:center;gap:0;padding-top:28px">
  <div style="width:280px;height:280px;border-radius:28px;background:linear-gradient(160deg,#23282D,#3C444C);display:flex;align-items:center;justify-content:center;color:#fff;position:relative">
    <div style="display:flex;gap:5px;align-items:flex-end;height:70px">{"".join(f'<i style="display:block;width:6px;border-radius:3px;background:rgba(255,255,255,{o});height:{h}px"></i>' for h,o in [(20,.5),(44,.7),(66,.95),(38,.7),(54,.85),(26,.55),(48,.8),(70,1),(34,.6),(22,.5)])}</div>
    <span class="tag" style="position:absolute;left:14px;top:14px;background:rgba(255,255,255,.14);color:#fff">{ic("mic")}&nbsp;Audio only</span>
  </div>
  <div class="h2" style="text-align:center;margin-top:30px;line-height:1.25">Trey Research / Relecloud: Demo + POV Discussion</div>
  <div class="sub" style="margin-top:6px">Sep 5 · Relecloud · 44 min</div>
  <div style="width:100%;margin-top:30px"><div class="scrub"><i style="width:38%"></i><b style="left:38%"></b></div>
  <div class="row mono sub" style="justify-content:space-between;font-size:12px;margin-top:8px"><span>16:42</span><span>-27:19</span></div></div>
  <div class="row" style="gap:30px;margin-top:22px;align-items:center">
    <span class="mono" style="font-size:13px;font-weight:600;width:44px;text-align:center">1.5×</span>
    {ic("back10","icon24")}
    <div style="width:72px;height:72px;border-radius:50%;background:var(--ink);color:var(--bg);display:flex;align-items:center;justify-content:center">{ic("pause","icon24")}</div>
    {ic("fwd10","icon24")}
    <div style="width:44px;display:flex;justify-content:center">{ic("video","icon24")}</div>
  </div>
  <div class="card row" style="width:100%;margin-top:32px;padding:12px 14px;gap:12px;background:var(--accent-soft);border-color:transparent">
    <div class="avatar" style="background:var(--s2);width:28px;height:28px;font-size:11px">MD</div>
    <div class="grow" style="font-size:14px;line-height:1.45"><span style="font-weight:700;color:var(--s2)">Relecloud</span> · Got it. And does the filtering happen on our side or yours?</div>
  </div>
</div>
<div class="home"></div>
'''

def sres(title, meta, snippet, t):
    return f'''<div class="col" style="padding:12px 20px;gap:8px">
  <div class="row" style="gap:12px"><div class="thumb" style="width:56px;height:38px"></div><div class="grow"><div style="font-size:15px;font-weight:700">{title}</div><div class="sub mono" style="font-size:12px">{meta}</div></div></div>
  <div class="row" style="gap:10px;align-items:flex-start;padding-left:68px"><div style="width:2px;align-self:stretch;background:var(--line);border-radius:1px"></div><div class="grow sub" style="font-size:13px;line-height:1.5">{snippet}</div><span class="ts mono">{t}</span></div>
</div>'''

HL='<b class="hl">'
SEARCH = f'''
<div class="status"></div>
<div class="px row" style="gap:10px;height:52px"><div class="field grow" style="background:var(--surface);border:1.5px solid var(--accent);color:var(--ink)">{ic("search")}<span class="grow">pricing</span>{ic("x")}</div><span style="font-size:15px;font-weight:600;color:var(--accent)">Cancel</span></div>
<div class="px" style="padding-top:10px"><div class="seg"><div>Titles</div><div class="on">Transcripts</div><div>Clips</div></div></div>
<div class="row px sub" style="gap:6px;padding-top:10px;font-size:12px">{ic("wifi")}<span>Searching 63 transcripts on this device · 7 matches</span></div>
{sres("[Woodgrove &amp; Northwind] - Pricing","Jul 2 · 19m · Woodgrove","…tomas.lind: And the "+HL+"pricing</b> per user, we were discussing that with Mira…","8:06")}
<div class="hr" style="margin-left:20px"></div>
{sres("Lamna - Trey Research // Pricing","Apr 17 · 38m · Lamna","…wanted to catch up with you, talk about some "+HL+"pricing</b> options. Got a couple different options…","12:36")}
<div class="hr" style="margin-left:20px"></div>
{sres("Mia / Theo (Northwind)","Jun 3 · 24m · Proseware","…customers who try to bluff you with "+HL+"pricing</b>. But since you guys have been there before…","21:49")}
<div class="hr" style="margin-left:20px"></div>
{sres("Jordan @ Wingtip","Mar 20 · 38m · Wingtip","…the overall "+HL+"pricing</b> model for this from a commercial standpoint…","31:51")}
{tabbar("Search")}
'''

def clipcard(title, meta, src, dur):
    return f'''<div class="row" style="padding:12px 20px;gap:12px;align-items:flex-start">
  <div class="thumb" style="width:96px;height:64px;border-radius:10px"><span class="mono" style="position:absolute;left:6px;bottom:6px;font-size:11px;color:#fff;background:rgba(0,0,0,.55);padding:1px 5px;border-radius:4px">{dur}</span></div>
  <div class="grow col" style="gap:4px"><div style="font-size:14px;font-weight:700;line-height:1.35">{title}</div><div class="sub" style="font-size:12px">{meta}</div><div class="row sub" style="gap:4px;font-size:12px">{ic("video")}<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{src}</span></div></div>
</div>'''

CLIPS_FEED = f'''
<div class="status"></div>
<div class="px row" style="height:52px"><div class="h1 grow">Clips</div><div class="iconbtn">{ic("sliders","icon24")}</div></div>
<div class="row" style="gap:8px;padding:6px 20px 4px"><span class="chip on">Workspace</span><span class="chip">Mine</span><span class="chip">Sales</span></div>
{clipcard("Felix questions SIEM alerts; prefers consolidating investigations in Google SecOps","Aug 23 · Mia Duarte","Trey Research / Coho chat","0:46")}
<div class="hr" style="margin-left:128px"></div>
{clipcard("Team praises improved Trey Research reporting; client compares with older intel","Aug 20 · Lucas Natarajan","Trey Research vs Adatum Sesh","0:48")}
<div class="hr" style="margin-left:128px"></div>
{clipcard("Ravi explains Trey Research's managed agentic security architecture, integrations, and experts","Aug 12 · Felix Whitfield","Adatum - Trey Research // Kickoff","9:00")}
<div class="hr" style="margin-left:128px"></div>
{clipcard("Discussing SIEM integration, detections onboarding, and co-managed alerts","Jul 23 · Felix Whitfield","Connect on Trey Research","0:52")}
<div class="hr" style="margin-left:128px"></div>
{clipcard("Speaker praises Trey Research's omnipresent, 24/7 support and team involvement","Jul 12 · Lucas Reyes","Coho // Trey Research Demo","1:00")}
{mini()}
{tabbar("Clips")}
'''

def act(icon, label, sub="", ext=False):
    return f'''<div class="row" style="height:52px;gap:14px">{ic(icon)}<div class="grow"><div style="font-size:15px;font-weight:600">{label}</div>{f'<div class="sub" style="font-size:12px">{sub}</div>' if sub else ''}</div>{ic("ext") if ext else ic("chev")}</div>'''

ACTIONS = f'''
<div style="position:absolute;inset:0;background:var(--scrim)"></div>
<div class="sheet" style="height:700px">
  <div class="grab"></div>
  <div class="row" style="gap:12px;padding-bottom:12px"><div class="thumb"></div><div class="grow"><div style="font-size:15px;font-weight:700;line-height:1.3">Trey Research / Relecloud: Demo + POV Discussion</div><div class="sub" style="font-size:12px">Sep 5 · 44 min</div></div></div>
  <div class="hr"></div>
  {act("share","Share link","Anyone in the workspace can open it")}
  {act("download","Download for offline","Video · 312 MB")}
  {act("tag","Tags","sales, pov")}
  {act("copy","Copy transcript","Plain text, for pasting into an AI chat")}
  {act("clock","Rename")}
  <div class="cap" style="margin-top:14px;margin-bottom:4px">In Grain</div>
  <div class="sub" style="font-size:13px;margin-bottom:6px">These open the Grain web app at this meeting.</div>
  {act("text","Comments &amp; clips","",True)}
  {act("list","Add to playlist","",True)}
  {act("people","Change who can view","",True)}
  {act("ext","Send to Slack, HubSpot, Salesforce","",True)}
</div>
'''

def srow(icon, label, val="", last=False):
    return f'''<div class="row" style="height:50px;padding:0 14px;gap:12px">{ic(icon)}<span class="grow" style="font-size:15px;font-weight:600">{label}</span><span class="sub">{val}</span>{ic("chev")}</div>{'' if last else '<div class="hr" style="margin-left:46px"></div>'}'''

SETTINGS = f'''
<div class="status"></div>
<div class="px row" style="height:52px"><div class="h1 grow">Settings</div></div>
<div class="px col" style="gap:20px;padding-top:8px">
  <div class="card row" style="padding:14px;gap:14px"><div class="avatar" style="background:var(--s4);width:48px;height:48px;font-size:16px">LN</div><div class="grow"><div style="font-size:16px;font-weight:700">Lucas Natarajan</div><div class="sub" style="font-size:13px">lucas.natarajan@treyresearch.example · Trey Research</div></div></div>
  <div class="col" style="gap:8px"><div class="cap">Playback</div><div class="card col" style="gap:0">{srow("speed","Default speed","1.5×")}{srow("wifi","Audio only on cellular","On")}{srow("pip","Picture in picture","On",True)}</div></div>
  <div class="col" style="gap:8px"><div class="cap">Storage</div><div class="card col" style="gap:0">{srow("download","Downloads","3 meetings · 890 MB")}{srow("text","Transcript search index","63 meetings · 41 MB")}{srow("clock","Keep downloads for","30 days",True)}</div></div>
  <div class="col" style="gap:8px"><div class="cap">Account</div><div class="card col" style="gap:0">{srow("key","Personal access token","grain_pat_••••")}{srow("ext","Open Grain settings","",True)}</div></div>
  <div class="sub" style="font-size:12px;text-align:center;padding-top:4px">Grist 0.1 · open source · github.com/Asafrose/grist-app</div>
</div>
{tabbar("Settings")}
'''

# ---------------------------------------------------------------- Direction sketches (low-fi)
SK_CSS = """
.sk-app{width:390px;height:844px;overflow:hidden;position:relative;font-family:'Plus Jakarta Sans',system-ui,sans-serif;padding:60px 20px 0}
.sk-box{border:1.5px dashed #9AA0A6;border-radius:10px}
.sk-line{height:10px;border-radius:5px;background:#D5D8DC}
"""
DIR_A = f'''
<div class="sk-app" style="background:#FBF7EF;color:#2B2622;font-family:Georgia,'Times New Roman',serif">
  <div style="font-size:30px;font-weight:700;letter-spacing:-.02em">Meetings</div>
  <div style="font-size:13px;color:#8A7F72;margin-top:4px;font-family:'Plus Jakarta Sans',sans-serif">Warm editorial · serif titles · paper ground</div>
  <div class="sk-box" style="height:44px;margin-top:20px"></div>
  <div style="margin-top:28px;font-size:12px;color:#8A7F72;font-family:'Plus Jakarta Sans',sans-serif;text-transform:uppercase;letter-spacing:.08em">Today</div>
  {"".join(f'<div style="display:flex;gap:14px;margin-top:18px"><div class="sk-box" style="width:64px;height:64px;border-radius:50%"></div><div style="flex:1"><div style="font-size:19px;font-weight:700;line-height:1.2">{t}</div><div class="sk-line" style="width:{w}%;margin-top:10px;background:#E5DCCB"></div></div></div>' for t,w in [("Trey Research / Relecloud: Demo + POV",60),("Trey Research &amp; FABRIKAM",45),("Platform Team Daily",50)])}
  <div style="position:absolute;left:20px;right:20px;bottom:110px;height:64px;border-radius:32px;background:#2B2622;color:#FBF7EF;display:flex;align-items:center;padding:0 22px;font-family:'Plus Jakarta Sans',sans-serif;font-size:14px">▶&nbsp; Now playing · 16:42</div>
  <div style="position:absolute;left:0;right:0;bottom:0;height:90px;border-top:1.5px dashed #C9BEAE"></div>
</div>
'''
DIR_B = f'''
<div class="sk-app" style="background:#0C0E10;color:#F2F2F0">
  <div style="font-size:30px;font-weight:800;letter-spacing:-.02em">Meetings</div>
  <div style="font-size:13px;color:#8A9096;margin-top:4px">Dark cinematic · media-first · big thumbnails</div>
  <div class="sk-box" style="height:44px;margin-top:20px;border-color:#3A4046"></div>
  {"".join(f'<div style="margin-top:18px"><div class="sk-box" style="height:150px;border-radius:16px;border-color:#3A4046;background:linear-gradient(160deg,#1C2126,#2A3138)"></div><div style="font-size:16px;font-weight:700;margin-top:10px">{t}</div><div class="sk-line" style="width:{w}%;margin-top:8px;background:#2A3138"></div></div>' for t,w in [("Trey Research / Relecloud: Demo + POV Discussion",50),("Trey Research &amp; FABRIKAM",40)])}
  <div style="position:absolute;left:0;right:0;bottom:0;height:90px;border-top:1.5px dashed #3A4046"></div>
</div>
'''

def sketch(body):
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  {FONTS}
  <style>body{{margin:0}} a{{color:#0E8C86}} a:hover{{color:#1B1D1F}} .sk-app *{{box-sizing:border-box}}{SK_CSS}</style>
</helmet>
{body}
</x-dc>
</body>
</html>
"""

FILES = {
 "Main.dc.html": shell(MEETINGS),
 "SignIn.dc.html": shell(SIGNIN),
 "Filters.dc.html": shell(FILTERS),
 "MeetingSummary.dc.html": shell(SUMMARY),
 "MeetingTranscript.dc.html": shell(TRANSCRIPT),
 "MeetingTimeline.dc.html": shell(TIMELINE),
 "MeetingClips.dc.html": shell(CLIPS_TAB),
 "NowPlaying.dc.html": shell(AUDIO, props='{"theme":{"editor":"enum","options":["light","dark"],"default":"dark","section":"Theme"}}'),
 "Search.dc.html": shell(SEARCH),
 "ClipsFeed.dc.html": shell(CLIPS_FEED),
 "Actions.dc.html": shell(ACTIONS),
 "Settings.dc.html": shell(SETTINGS),
 "DirectionWarmEditorial.dc.html": sketch(DIR_A),
 "DirectionDarkCinematic.dc.html": sketch(DIR_B),
}

W,H,GX,GY = 390,844,80,140
def pos(i, row): return {"x": i*(W+GX), "y": row*(H+GY)}
boards = []
row0 = ["SignIn.dc.html","Main.dc.html","Filters.dc.html","Search.dc.html","ClipsFeed.dc.html","Settings.dc.html"]
row1 = ["MeetingSummary.dc.html","MeetingTranscript.dc.html","MeetingTimeline.dc.html","MeetingClips.dc.html","Actions.dc.html","NowPlaying.dc.html"]
titles = {"Main.dc.html":"Meetings","SignIn.dc.html":"Sign in","Filters.dc.html":"Filters sheet","Search.dc.html":"Search","ClipsFeed.dc.html":"Clips feed","Settings.dc.html":"Settings",
 "MeetingSummary.dc.html":"Meeting · Summary","MeetingTranscript.dc.html":"Meeting · Transcript","MeetingTimeline.dc.html":"Meeting · Timeline","MeetingClips.dc.html":"Meeting · Clips","Actions.dc.html":"Actions sheet","NowPlaying.dc.html":"Now playing (audio, dark)"}
for i,f in enumerate(row0): boards.append({"file":f,"w":W,"h":H,"title":titles[f],"page":"screens",**pos(i,0)})
for i,f in enumerate(row1): boards.append({"file":f,"w":W,"h":H,"title":titles[f],"page":"screens",**pos(i,1)})
boards.append({"file":"DirectionWarmEditorial.dc.html","w":W,"h":H,"title":"Alt A · Warm editorial","page":"directions","x":0,"y":0})
boards.append({"file":"DirectionDarkCinematic.dc.html","w":W,"h":H,"title":"Alt B · Dark cinematic","page":"directions","x":W+GX,"y":0})

canvas = {
 "pages":[{"id":"screens","name":"Screens"},{"id":"directions","name":"Alternate directions"}],
 "artboards": boards,
 "annotations":[
  {"id":"note-system","page":"screens","x":0,"y":-260,"w":420,"text":"Design system\nCalm, reading-first, flat. Warm neutral ground, one teal accent, rust for External.\nType: Plus Jakarta Sans (UI) + JetBrains Mono (timestamps, durations).\nEvery artboard has a light/dark tweak. Icons: 1.75px stroke, 20/24px.\nStatus bar and home indicator are left as empty space, never painted."},
  {"id":"note-nav","page":"screens","x":470,"y":-200,"w":380,"text":"Navigation\n4 tabs: Meetings, Search, Clips, Settings. Playlists, Stories and Coaching are not in the API, so they are not tabs.\nA mini player sits above the tab bar whenever something is playing. Tap it for Now playing; swipe down to collapse."},
  {"id":"note-scope","page":"screens","x":940,"y":-200,"w":420,"text":"Scope filter\nThe scope chips (Mine / Workspace / team) and the External/Internal chip map straight to the API filters. Company and Participant are computed on device from the participants list."},
  {"id":"note-detail","page":"screens","x":0,"y":(H+GY)*2-40,"w":460,"text":"Meeting detail\nPlayer stays pinned; the four tabs scroll under it. Every timestamp chip seeks the player.\nSummary, action items and template sections come from the API. Checkboxes are read-only for now (no write endpoint), so tapping one seeks instead of toggling.\nChapters are not in the API, so the scrubber has no chapter marks."},
  {"id":"note-transcript","page":"screens","x":470,"y":(H+GY)*2-40,"w":420,"text":"Transcript\nSpeaker colours are stable per participant across Transcript and Timeline. Follow keeps the current line centred; scrolling pauses follow until tapped again. Search here is local to this meeting."},
  {"id":"note-actions","page":"screens","x":1880,"y":(H+GY)*2-40,"w":420,"text":"Actions sheet\nTop group is what the API can do. The 'In Grain' group is every deferred feature from PARITY.md, deep-linking to the recording URL rather than stubbing it."},
  {"id":"note-search","page":"screens","x":1410,"y":-200,"w":420,"text":"Search\nTitles search the API live. Transcripts search a local index built from cached transcripts, so the result line says how many meetings are covered and it works offline."},
  {"id":"note-dirs","page":"directions","x":0,"y":-200,"w":520,"text":"Two low-fi alternates to the chosen direction, kept for comparison.\nA trades legibility density for warmth; B trades scanability for a media-first feel. The main direction sits between them: neutral, high-contrast, list-dense, with a dark mode for listening."}
 ],
 "launch":{"view":"canvas","page":"screens"}
}

for name, src in FILES.items():
    (OUT/name).write_text(src)
(OUT/"canvas.json").write_text(json.dumps(canvas, indent=1))
print(f"wrote {len(FILES)} artboards + canvas.json to {OUT}")
