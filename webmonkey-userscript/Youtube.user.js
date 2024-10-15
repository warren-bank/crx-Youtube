// ==UserScript==
// @name         Youtube
// @description  Play media in external player.
// @version      2.0.2
// @match        *://youtube.googleapis.com/v/*
// @match        *://youtube.com/watch?v=*
// @match        *://youtube.com/embed/*
// @match        *://*.youtube.com/watch?v=*
// @match        *://*.youtube.com/embed/*
// @icon         https://www.youtube.com/favicon.ico
// @require      https://cdn.jsdelivr.net/npm/@warren-bank/browser-ytdl-core@latest/dist/es2020/ytdl-core.js
// @run-at       document_end
// @grant        unsafeWindow
// @homepage     https://github.com/warren-bank/crx-Youtube/tree/webmonkey-userscript/es6
// @supportURL   https://github.com/warren-bank/crx-Youtube/issues
// @downloadURL  https://github.com/warren-bank/crx-Youtube/raw/webmonkey-userscript/es6/webmonkey-userscript/Youtube.user.js
// @updateURL    https://github.com/warren-bank/crx-Youtube/raw/webmonkey-userscript/es6/webmonkey-userscript/Youtube.user.js
// @namespace    warren-bank
// @author       Warren Bank
// @copyright    Warren Bank
// ==/UserScript==

// ----------------------------------------------------------------------------- constants

const user_options = {
  "show_media_formats_button":     true,
  "redirect_to_webcast_reloaded":  true,
  "force_http":                    true,
  "force_https":                   false
}

const strings = {
  "buttons": {
    "start_media":                 "Start Media",
    "show_details":                "Show Details"
  }
}

const constants = {
  "dom_classes": {
    "div_media_summary":           "media_summary",
    "div_webcast_icons":           "icons-container",
    "div_media_buttons":           "media_buttons",
    "btn_start_media":             "start_media",
    "btn_show_details":            "show_details",
    "div_media_details":           "media_details"
  },
  "img_urls": {
    "base_webcast_reloaded_icons": "https://github.com/warren-bank/crx-webcast-reloaded/raw/gh-pages/chrome_extension/2-release/popup/img/"
  }
}

// ----------------------------------------------------------------------------- state

const state = {
  formats: null
}

// ----------------------------------------------------------------------------- CSP

// add support for CSP 'Trusted Type' assignment
const add_default_trusted_type_policy = () => {
  if (typeof unsafeWindow.trustedTypes !== 'undefined') {
    try {
      const passthrough_policy = string => string

      unsafeWindow.trustedTypes.createPolicy('default', {
          createHTML:      passthrough_policy,
          createScript:    passthrough_policy,
          createScriptURL: passthrough_policy
      })
    }
    catch(e) {}
  }
}

// ----------------------------------------------------------------------------- helpers

const make_element = (elementName, html) => {
  const el = unsafeWindow.document.createElement(elementName)

  if (html)
    el.innerHTML = html

  return el
}

// ----------------------------------------------------------------------------- URL links to tools on Webcast Reloaded website

const get_webcast_reloaded_url = (video_url, vtt_url, referer_url, force_http, force_https) => {
  force_http  = (typeof force_http  === 'boolean') ? force_http  : user_options.force_http
  force_https = (typeof force_https === 'boolean') ? force_https : user_options.force_https

  let encoded_video_url, encoded_vtt_url, encoded_referer_url, webcast_reloaded_base, webcast_reloaded_url

  encoded_video_url     = encodeURIComponent(encodeURIComponent(btoa(video_url)))
  encoded_vtt_url       = vtt_url ? encodeURIComponent(encodeURIComponent(btoa(vtt_url))) : null
  referer_url           = referer_url ? referer_url : unsafeWindow.location.href
  encoded_referer_url   = encodeURIComponent(encodeURIComponent(btoa(referer_url)))

  webcast_reloaded_base = {
    "https": "https://warren-bank.github.io/crx-webcast-reloaded/external_website/index.html",
    "http":  "http://webcast-reloaded.surge.sh/index.html"
  }

  webcast_reloaded_base = (force_http)
                            ? webcast_reloaded_base.http
                            : (force_https)
                               ? webcast_reloaded_base.https
                               : (video_url.toLowerCase().indexOf('http:') === 0)
                                  ? webcast_reloaded_base.http
                                  : webcast_reloaded_base.https

  webcast_reloaded_url  = webcast_reloaded_base + '#/watch/' + encoded_video_url + (encoded_vtt_url ? ('/subtitle/' + encoded_vtt_url) : '') + '/referer/' + encoded_referer_url
  return webcast_reloaded_url
}

// -----------------------------------------------------------------------------

const get_webcast_reloaded_url_chromecast_sender = (video_url, vtt_url, referer_url) => {
  return get_webcast_reloaded_url(video_url, vtt_url, referer_url, /* force_http= */ null, /* force_https= */ null).replace('/index.html', '/chromecast_sender.html')
}

const get_webcast_reloaded_url_airplay_sender = (video_url, vtt_url, referer_url) => {
  return get_webcast_reloaded_url(video_url, vtt_url, referer_url, /* force_http= */ true, /* force_https= */ false).replace('/index.html', '/airplay_sender.es5.html')
}

const get_webcast_reloaded_url_proxy = (hls_url, vtt_url, referer_url) => {
  return get_webcast_reloaded_url(hls_url, vtt_url, referer_url, /* force_http= */ true, /* force_https= */ false).replace('/index.html', '/proxy.html')
}

const make_webcast_reloaded_div = (video_url, vtt_url, referer_url) => {
  const webcast_reloaded_urls = {
//  "index":             get_webcast_reloaded_url(                  video_url, vtt_url, referer_url),
    "chromecast_sender": get_webcast_reloaded_url_chromecast_sender(video_url, vtt_url, referer_url),
    "airplay_sender":    get_webcast_reloaded_url_airplay_sender(   video_url, vtt_url, referer_url),
    "proxy":             get_webcast_reloaded_url_proxy(            video_url, vtt_url, referer_url)
  }

  const div = make_element('div')

  const html = [
    '<a target="_blank" class="chromecast" href="' + webcast_reloaded_urls.chromecast_sender + '" title="Chromecast Sender"><img src="'       + constants.img_urls.base_webcast_reloaded_icons + 'chromecast.png"></a>',
    '<a target="_blank" class="airplay" href="'    + webcast_reloaded_urls.airplay_sender    + '" title="ExoAirPlayer Sender"><img src="'     + constants.img_urls.base_webcast_reloaded_icons + 'airplay.png"></a>',
    '<a target="_blank" class="proxy" href="'      + webcast_reloaded_urls.proxy             + '" title="HLS-Proxy Configuration"><img src="' + constants.img_urls.base_webcast_reloaded_icons + 'proxy.png"></a>',
    '<a target="_blank" class="video-link" href="' + video_url                               + '" title="direct link to video"><img src="'    + constants.img_urls.base_webcast_reloaded_icons + 'video_link.png"></a>'
  ]

  div.setAttribute('class', constants.dom_classes.div_webcast_icons)
  div.innerHTML = html.join("\n")

  return div
}

var insert_webcast_reloaded_div = function(block_element, video_url, vtt_url, referer_url) {
  var webcast_reloaded_div = make_webcast_reloaded_div(video_url, vtt_url, referer_url)

  if (block_element.childNodes.length)
    block_element.insertBefore(webcast_reloaded_div, block_element.childNodes[0])
  else
    block_element.appendChild(webcast_reloaded_div)
}

// ----------------------------------------------------------------------------- URL redirect

const redirect_to_url = (url) => {
  if (!url) return

  try {
    unsafeWindow.top.location = url
  }
  catch(e) {
    unsafeWindow.location = url
  }
}

const process_video_url = (video_url, video_type, vtt_url, referer_url) => {
  if (!referer_url)
    referer_url = unsafeWindow.location.href

  if (typeof GM_startIntent === 'function') {
    // running in Android-WebMonkey: open Intent chooser

    const args = [
      /* action = */ 'android.intent.action.VIEW',
      /* data   = */ video_url,
      /* type   = */ video_type
    ]

    // extras:
    if (vtt_url) {
      args.push('textUrl')
      args.push(vtt_url)
    }
    if (referer_url) {
      args.push('referUrl')
      args.push(referer_url)
    }

    GM_startIntent(...args)
    return true
  }
  else if (user_options.redirect_to_webcast_reloaded) {
    // running in standard web browser: redirect URL to top-level tool on Webcast Reloaded website

    redirect_to_url(get_webcast_reloaded_url(video_url, vtt_url, referer_url))
    return true
  }
  else {
    return false
  }
}

// ----------------------------------------------------------------------------- display interstitial button

const add_media_formats_button = () => {
  const button = make_element('button', '<span>Show Media Formats</span>')

  button.style.position = 'fixed'
  button.style.top = '10px'
  button.style.right = '10px'
  button.style.zIndex = '9999'
  button.style.backgroundColor = '#065fd4'
  button.style.color = '#fff'
  button.style.padding = '10px 15px'
  button.style.borderRadius = '18px'
  button.style.borderStyle = 'none'
  button.style.outline = 'none'
  button.style.fontWeight = 'bold'
  button.style.cursor = 'pointer'

  button.addEventListener('click', rewrite_page_dom)

  document.body.appendChild(button)
}

// ----------------------------------------------------------------------------- display results

const format_subset_to_tablerows = (format) => {
  const keys_whitelist = ["mimeType", "codecs", "bitrate", "qualityLabel", "audioSampleRate"]
  const rows = []

  for (let key in format) {
    if ((keys_whitelist.indexOf(key) >= 0) && format[key])
      rows.push([key, format[key]])
  }

  return rows.length
    ? rows.map(row => `<tr><td>${row[0]}:</td><td>${row[1]}</td></tr>`).join("\n")
    : ''
}

const format_to_listitem = (format) => {
  const inner_html = [
    `<div class="${constants.dom_classes.div_media_summary}">`,
      '<table>',
        format_subset_to_tablerows(format),
      '</table>',
    '</div>',
    `<div class="${constants.dom_classes.div_media_buttons}">`,
      `<button class="${constants.dom_classes.btn_start_media}">${strings.buttons.start_media}</button>`,
      `<button class="${constants.dom_classes.btn_show_details}">${strings.buttons.show_details}</button>`,
    '</div>',
    `<div class="${constants.dom_classes.div_media_details}" style="display:none">`,
      `<pre>${JSON.stringify(format, null, 2)}</pre>`,
    '</div>'
  ]

  return make_element('li', inner_html.join("\n"))
}

const attach_button_event_handlers_to_listitem = (li, format) => {
  const button_start_media  = li.querySelector('button.' + constants.dom_classes.btn_start_media)
  const button_show_details = li.querySelector('button.' + constants.dom_classes.btn_show_details)
  const div_media_details   = li.querySelector('div.'    + constants.dom_classes.div_media_details)

  button_start_media.addEventListener('click', () => {
    const video_url   = format.url
    const video_type  = format.mimeType
    const vtt_url     = null
    const referer_url = unsafeWindow.location.href

    process_video_url(video_url, video_type, vtt_url, referer_url)
  })

  button_show_details.addEventListener('click', () => {
    div_media_details.style.display = (div_media_details.style.display === 'none') ? 'block' : 'none'
  })
}

const insert_webcast_reloaded_div_to_listitem = (li, format) => {
  const block_element = li.querySelector('div.' + constants.dom_classes.div_media_summary)
  const video_url     = format.url
  const vtt_url       = null
  const referer_url   = unsafeWindow.location.href

  insert_webcast_reloaded_div(block_element, video_url, vtt_url, referer_url)
}

const rewrite_page_dom = () => {
  const head  = unsafeWindow.document.getElementsByTagName('head')[0]
  const body  = unsafeWindow.document.body
  const title = unsafeWindow.document.title

  const html = {
    "head": [
      '<style>',

      'body {',
      '  background-color: #fff;',
      '}',

      'body > div > h2 {',
      '  text-align: center;',
      '  margin: 0.5em 0;',
      '}',

      'body > div > ul > li > div.media_summary {',
      '}',
      'body > div > ul > li > div.media_summary > table {',
      '  border-collapse: collapse;',
      '}',
      'body > div > ul > li > div.media_summary > table td {',
      '  border: 1px solid #999;',
      '  padding: 0.5em;',
      '}',
      'body > div > ul > li > div.media_summary > div.icons-container {',
      '}',

      'body > div > ul > li > div.media_buttons {',
      '}',
      'body > div > ul > li > div.media_buttons > button.start_media {',
      '}',
      'body > div > ul > li > div.media_buttons > button.show_details {',
      '  margin-left: 0.5em;',
      '}',

      'body > div > ul > li > div.media_details {',
      '}',
      'body > div > ul > li > div.media_details > pre {',
      '  background-color: #eee;',
      '  padding: 0.5em;',
      '}',

      // --------------------------------------------------- CSS: reset

      'h2 {',
      '  font-size: 24px;',
      '}',

      'body, td {',
      '  font-size: 18px;',
      '}',

      'button {',
      '  font-size: 16px;',
      '}',

      'pre {',
      '  font-size: 14px;',
      '}',

      // --------------------------------------------------- CSS: separation between media formats

      'body > div > ul {',
      '  list-style: none;',
      '  margin: 0;',
      '  padding: 0;',
      '}',

      'body > div > ul > li {',
      '  list-style: none;',
      '  margin-top: 0.5em;',
      '  border-top: 1px solid #999;',
      '  padding-top: 0.5em;',
      '}',

      'body > div > ul > li > div {',
      '  margin-top: 0.5em;',
      '}',

      // --------------------------------------------------- CSS: links to tools on Webcast Reloaded website

      'body > div > ul > li > div.media_summary > div.icons-container {',
      '  display: block;',
      '  position: relative;',
      '  z-index: 1;',
      '  float: right;',
      '  margin: 0.5em;',
      '  width: 60px;',
      '  height: 60px;',
      '  max-height: 60px;',
      '  vertical-align: top;',
      '  background-color: #d7ecf5;',
      '  border: 1px solid #000;',
      '  border-radius: 14px;',
      '}',

      'body > div > ul > li > div.media_summary > div.icons-container > a.chromecast,',
      'body > div > ul > li > div.media_summary > div.icons-container > a.chromecast > img,',
      'body > div > ul > li > div.media_summary > div.icons-container > a.airplay,',
      'body > div > ul > li > div.media_summary > div.icons-container > a.airplay > img,',
      'body > div > ul > li > div.media_summary > div.icons-container > a.proxy,',
      'body > div > ul > li > div.media_summary > div.icons-container > a.proxy > img,',
      'body > div > ul > li > div.media_summary > div.icons-container > a.video-link,',
      'body > div > ul > li > div.media_summary > div.icons-container > a.video-link > img {',
      '  display: block;',
      '  width: 25px;',
      '  height: 25px;',
      '}',

      'body > div > ul > li > div.media_summary > div.icons-container > a.chromecast,',
      'body > div > ul > li > div.media_summary > div.icons-container > a.airplay,',
      'body > div > ul > li > div.media_summary > div.icons-container > a.proxy,',
      'body > div > ul > li > div.media_summary > div.icons-container > a.video-link {',
      '  position: absolute;',
      '  z-index: 1;',
      '  text-decoration: none;',
      '}',

      'body > div > ul > li > div.media_summary > div.icons-container > a.chromecast,',
      'body > div > ul > li > div.media_summary > div.icons-container > a.airplay {',
      '  top: 0;',
      '}',
      'body > div > ul > li > div.media_summary > div.icons-container > a.proxy,',
      'body > div > ul > li > div.media_summary > div.icons-container > a.video-link {',
      '  bottom: 0;',
      '}',

      'body > div > ul > li > div.media_summary > div.icons-container > a.chromecast,',
      'body > div > ul > li > div.media_summary > div.icons-container > a.proxy {',
      '  left: 0;',
      '}',
      'body > div > ul > li > div.media_summary > div.icons-container > a.airplay,',
      'body > div > ul > li > div.media_summary > div.icons-container > a.video-link {',
      '  right: 0;',
      '}',
      'body > div > ul > li > div.media_summary > div.icons-container > a.airplay + a.video-link {',
      '  right: 17px; /* (60 - 25)/2 to center when there is no proxy icon */',
      '}',

      // ---------------------------------------------------

      '</style>'
    ],
    "body": [
      '<div>',
        '<ul>',
        '</ul>',
      '</div>'
    ]
  }

  if (title) {
    html.head.unshift(`<title>${title}</title>`)
    html.body.unshift(`<div><h2>${title}</h2></div>`)
  }

  head.innerHTML = '' + html.head.join("\n")
  body.innerHTML = '' + html.body.join("\n")

  const ul = body.querySelector('ul')
  if (!ul) return

  for (let format of state.formats) {
    const li = format_to_listitem(format)
    ul.appendChild(li)
    attach_button_event_handlers_to_listitem(li, format)
    insert_webcast_reloaded_div_to_listitem(li, format)
  }
}

// ----------------------------------------------------------------------------- data structure

const mime_filetype_regex = /^(?:audio|video)\/([^;]+)(?:;.*)?$/

const normalize_formats = (formats) => formats
  .filter(format => !!format && (typeof format === 'object') && format.url && format.mimeType)
  .map(format => {
    if (format.isHLS) {
      format.mimeType = 'application/x-mpegurl'
      format.url += '#video.m3u8'
    }
    else if (format.isDashMPD) {
      format.mimeType = 'application/dash+xml'
      format.url += '#video.mpd'
    }
    else {
      format.mimeType = format.mimeType.split(';')[0].trim()

      if (!format.container && mime_filetype_regex.test(format.mimeType))
        format.container = format.mimeType.replace(mime_filetype_regex, '$1')

      if (format.container)
        format.url += '#file.' + format.container
    }
    return format
  })
  .sort((a,b) => {
    // sort formats by bitrate in decreasing order
    return (a.bitrate < b.bitrate)
      ? 1 : (a.bitrate === b.bitrate)
      ?  0 : -1
  })

// ----------------------------------------------------------------------------- bootstrap

const init = async () => {
  let info = await window.ytdl.getInfo(window.location.href)
  if (!info || !info.formats || !info.formats.length) return

  state.formats = normalize_formats(info.formats)
  info = null

  add_default_trusted_type_policy()

  if (user_options.show_media_formats_button)
    add_media_formats_button()
  else
    rewrite_page_dom()
}

if (window.ytdl) {
  init()
}

// -----------------------------------------------------------------------------
