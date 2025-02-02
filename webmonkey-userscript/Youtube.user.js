// ==UserScript==
// @name         Youtube
// @description  Play media in external player.
// @version      4.0.2
// @match        *://youtube.googleapis.com/v/*
// @match        *://*.youtube.com/watch?v=*
// @match        *://*.youtube.com/embed/*
// @icon         https://www.youtube.com/favicon.ico
// @require      https://cdn.jsdelivr.net/npm/@warren-bank/browser-ytdl-core@4.16.0-distubejs.1/dist/es2020/ytdl-core.js
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

// ----------------------------------------------------------------------------- config options

const user_options = {
  "debug_verbosity": 0,  // 0 = silent. 1 = console log. 2 = window alert. 3 = window alert + conditional breakpoint.
  "redirect_to_webcast_reloaded": true,
  "force_http": true,
  "force_https": false
}

// ----------------------------------------------------------------------------- constants

const constants = {
  query_selector: {
    userscripts_row_container_parent: "div#above-the-fold",
    userscripts_row_container_prev_sibling: "div#top-row"
  },
  element_id: {
    userscripts_row_container: "userscripts-row",
    media_formats_container: "media_formats_container"
  },
  button_text: {
    show_media_formats: "Show Media Formats",
    start_media: "Start Media",
    show_details: "Show Details",
    close_button: "X"
  },
  dom_classes: {
    div_media_summary: "media_summary",
    div_webcast_icons: "icons-container",
    div_media_buttons: "media_buttons",
    btn_start_media: "start_media",
    btn_show_details: "show_details",
    div_media_details: "media_details"
  },
  inline_css: {
    userscripts_row_container: "position: relative; top: 0; left: 0; overflow: visible;",
    media_formats_container: "display: block; position: absolute; top: 0px; left: 0px; z-index: 9999; background-color: white; padding: 2em; border: 1px solid #000; text-align: center;",
    close_button: "display: block; position: absolute; top: -1em; right: -1em; z-index: 9999; width: 2em; height: 2em; padding: 0.5em; line-height: 1em; cursor: pointer;",
    text_button: "background-color: #065fd4; color: #fff; padding: 10px 15px; border-radius: 18px; border-style: none; outline: none; font-weight: bold; cursor: pointer;",
    div_media_formats: "text-align: left;"
  },
  img_urls: {
    base_webcast_reloaded_icons: "https://github.com/warren-bank/crx-webcast-reloaded/raw/gh-pages/chrome_extension/2-release/popup/img/"
  }
}

// ----------------------------------------------------------------------------- state

const state = {
  library: null,
  formats: null
}

if (!state.library && window.Ytdl && window.Ytdl.YtdlCore)
  state.library = 'ybd-project'

if (!state.library && window.ytdl)
  state.library = 'distubejs'

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

// ----------------------------------------------------------------------------- debug logger

const debug = (msg, breakpoint) => {
  if (!user_options.debug_verbosity) return

  if (msg) {
    if (typeof msg !== 'string')
      msg = JSON.stringify(msg, null, 2)

    switch(user_options.debug_verbosity) {
      case 1:
        console.log(msg)
        break
      case 2:
      case 3:
        window.alert(msg)
        break
    }
  }

  if (breakpoint && (user_options.debug_verbosity > 2))
    debugger;
}

// ----------------------------------------------------------------------------- helpers

const make_element = (elementName, html) => {
  const el = unsafeWindow.document.createElement(elementName)

  if (html)
    el.innerHTML = html

  return el
}

const empty_element = (el, html) => {
  while (el.childNodes.length)
    el.removeChild(el.childNodes[0])

  if (html)
    el.innerHTML = html

  return el
}

const cancel_event = (event) => {
  event.stopPropagation();event.stopImmediatePropagation();event.preventDefault();event.returnValue=false;
}

// ----------------------------------------------------------------------------- DOM: container element for userscripts UI

const add_userscripts_row_container = (callback) => {
  const prev_sibling = unsafeWindow.document.querySelector(
    `${constants.query_selector.userscripts_row_container_parent} > ${constants.query_selector.userscripts_row_container_prev_sibling}`
  )
  if (!prev_sibling) {
    setTimeout(
      function() {
        add_userscripts_row_container(callback)
      },
      1000
    )
    return
  }
  // DOM is ready

  let userscripts_row_container = get_userscripts_row_container()
  if (userscripts_row_container) {
    // container has already been added to DOM (by another userscript with common UI)
    callback()
    return
  }

  userscripts_row_container = make_element('div')
  userscripts_row_container.setAttribute('id',    constants.element_id.userscripts_row_container)
  userscripts_row_container.setAttribute('style', constants.inline_css.userscripts_row_container)

  if (prev_sibling.nextSibling) {
    prev_sibling.parentNode.insertBefore(userscripts_row_container, prev_sibling.nextSibling)
  }
  else {
    prev_sibling.parentNode.appendChild(userscripts_row_container)
  }
  callback()
}

const get_userscripts_row_container = () => unsafeWindow.document.querySelector(`${constants.query_selector.userscripts_row_container_parent} > div#${constants.element_id.userscripts_row_container}`)

// ----------------------------------------------------------------------------- DOM: container element for media formats

const add_media_formats_container = () => {
  const userscripts_row_container = get_userscripts_row_container()
  const max_width = userscripts_row_container.parentElement.clientWidth
  const min_width = Math.floor(max_width / 4)

  const media_formats_container = make_element('div', `
    <button style="${constants.inline_css.close_button}">
      <span>${constants.button_text.close_button}</span>
    </button>
    <div></div>
  `)
  media_formats_container.setAttribute('id',    constants.element_id.media_formats_container)
  media_formats_container.setAttribute('style', constants.inline_css.media_formats_container + ` max-width: ${max_width}px; min-width: ${min_width}px;`)
  media_formats_container.querySelector('button').addEventListener('click', hide_media_formats_container.bind(null, media_formats_container))

  if (userscripts_row_container.childNodes.length) {
    userscripts_row_container.insertBefore(media_formats_container, userscripts_row_container.childNodes[0])
  }
  else {
    userscripts_row_container.appendChild(media_formats_container)
  }

  return media_formats_container
}

const get_media_formats_container = () => unsafeWindow.document.getElementById(constants.element_id.media_formats_container) || add_media_formats_container()

const hide_media_formats_container = (media_formats_container) => {
  if (!media_formats_container)
    media_formats_container = get_media_formats_container()

  media_formats_container.style.display = 'none'
}

const show_media_formats_container = (media_formats_container) => {
  if (!media_formats_container)
    media_formats_container = get_media_formats_container()

  media_formats_container.style.display = 'block'
}

const update_media_formats_container = (media_formats_container, html) => {
  if (!media_formats_container)
    media_formats_container = get_media_formats_container()

  const inner_div = media_formats_container.querySelector(':scope > div')
  if (inner_div)
    empty_element(inner_div, html)
}

// ----------------------------------------------------------------------------- DOM: button to display media formats

const add_show_media_formats_button = () => {
  const userscripts_row_container = get_userscripts_row_container()

  const show_media_formats_button = make_element('button', `<span>${constants.button_text.show_media_formats}</span>`)
  show_media_formats_button.setAttribute('style', constants.inline_css.text_button)
  show_media_formats_button.addEventListener('click', show_media_formats)

  userscripts_row_container.appendChild(show_media_formats_button)
}

// ----------------------------------------------------------------------------- DOM: media formats

const show_media_formats = (event) => {
  cancel_event(event)

  const media_formats_container = get_media_formats_container()
  hide_media_formats_container(media_formats_container)

  const css_prefix = `#${constants.element_id.media_formats_container} > div`

  let html = [
    '<style>',

    css_prefix + ' {',
    '  ' + constants.inline_css.div_media_formats,
    '}',

    css_prefix + ' > h2 {',
    '  text-align: center;',
    '  margin: 0.5em 0;',
    '}',

    css_prefix + ' > ul > li > div.media_summary {',
    '}',
    css_prefix + ' > ul > li > div.media_summary > table {',
    '  border-collapse: collapse;',
    '}',
    css_prefix + ' > ul > li > div.media_summary > table td {',
    '  border: 1px solid #999;',
    '  padding: 0.5em;',
    '}',
    css_prefix + ' > ul > li > div.media_summary > div.icons-container {',
    '}',

    css_prefix + ' > ul > li > div.media_buttons {',
    '}',
    css_prefix + ' > ul > li > div.media_buttons > button.start_media {',
    '}',
    css_prefix + ' > ul > li > div.media_buttons > button.show_details {',
    '  margin-left: 0.5em;',
    '}',

    css_prefix + ' > ul > li > div.media_details {',
    '}',
    css_prefix + ' > ul > li > div.media_details > pre {',
    '  background-color: #eee;',
    '  padding: 0.5em;',
    '}',

    // --------------------------------------------------- CSS: reset

    css_prefix + ',',
    css_prefix + ' td {',
    '  font-size: 18px;',
    '}',

    css_prefix + ' h2 {',
    '  font-size: 24px;',
    '}',

    css_prefix + ' button {',
    '  font-size: 16px;',
    '}',

    css_prefix + ' pre {',
    '  font-size: 14px;',
    '}',

    // --------------------------------------------------- CSS: separation between media formats

    css_prefix + ' > ul {',
    '  list-style: none;',
    '  margin: 0;',
    '  padding: 0;',
    '}',

    css_prefix + ' > ul > li {',
    '  list-style: none;',
    '  margin-top: 0.5em;',
    '  border-top: 1px solid #999;',
    '  padding-top: 0.5em;',
    '}',

    css_prefix + ' > ul > li > div {',
    '  margin-top: 0.5em;',
    '}',

    // --------------------------------------------------- CSS: links to tools on Webcast Reloaded website

    css_prefix + ' > ul > li > div.media_summary > div.icons-container {',
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

    css_prefix + ' > ul > li > div.media_summary > div.icons-container > a.chromecast,',
    css_prefix + ' > ul > li > div.media_summary > div.icons-container > a.chromecast > img,',
    css_prefix + ' > ul > li > div.media_summary > div.icons-container > a.airplay,',
    css_prefix + ' > ul > li > div.media_summary > div.icons-container > a.airplay > img,',
    css_prefix + ' > ul > li > div.media_summary > div.icons-container > a.proxy,',
    css_prefix + ' > ul > li > div.media_summary > div.icons-container > a.proxy > img,',
    css_prefix + ' > ul > li > div.media_summary > div.icons-container > a.video-link,',
    css_prefix + ' > ul > li > div.media_summary > div.icons-container > a.video-link > img {',
    '  display: block;',
    '  width: 25px;',
    '  height: 25px;',
    '}',

    css_prefix + ' > ul > li > div.media_summary > div.icons-container > a.chromecast,',
    css_prefix + ' > ul > li > div.media_summary > div.icons-container > a.airplay,',
    css_prefix + ' > ul > li > div.media_summary > div.icons-container > a.proxy,',
    css_prefix + ' > ul > li > div.media_summary > div.icons-container > a.video-link {',
    '  position: absolute;',
    '  z-index: 1;',
    '  text-decoration: none;',
    '}',

    css_prefix + ' > ul > li > div.media_summary > div.icons-container > a.chromecast,',
    css_prefix + ' > ul > li > div.media_summary > div.icons-container > a.airplay {',
    '  top: 0;',
    '}',
    css_prefix + ' > ul > li > div.media_summary > div.icons-container > a.proxy,',
    css_prefix + ' > ul > li > div.media_summary > div.icons-container > a.video-link {',
    '  bottom: 0;',
    '}',

    css_prefix + ' > ul > li > div.media_summary > div.icons-container > a.chromecast,',
    css_prefix + ' > ul > li > div.media_summary > div.icons-container > a.proxy {',
    '  left: 0;',
    '}',
    css_prefix + ' > ul > li > div.media_summary > div.icons-container > a.airplay,',
    css_prefix + ' > ul > li > div.media_summary > div.icons-container > a.video-link {',
    '  right: 0;',
    '}',
    css_prefix + ' > ul > li > div.media_summary > div.icons-container > a.airplay + a.video-link {',
    '  right: 17px; /* (60 - 25)/2 to center when there is no proxy icon */',
    '}',

    '</style>'
  ]

  const title = unsafeWindow.document.title
  if (title) {
    html.push(`<h2>${title}</h2>`)
  }

  html.push('<ul></ul>')

  update_media_formats_container(media_formats_container, html.join("\n"))
  html = null

  const ul = media_formats_container.querySelector(':scope > div > ul')
  if (!ul) return

  for (let format of state.formats) {
    const li = format_to_listitem(format)
    ul.appendChild(li)
    attach_button_event_handlers_to_listitem(li, format)
    insert_webcast_reloaded_div_to_listitem(li, format)
  }

  show_media_formats_container(media_formats_container)
}

// -----------------------------------------------------------------------------

const format_to_listitem = (format) => {
  const inner_html = [
    `<div class="${constants.dom_classes.div_media_summary}">`,
      '<table>',
        format_subset_to_tablerows(format),
      '</table>',
    '</div>',
    `<div class="${constants.dom_classes.div_media_buttons}">`,
      `<button class="${constants.dom_classes.btn_start_media}">${constants.button_text.start_media}</button>`,
      `<button class="${constants.dom_classes.btn_show_details}">${constants.button_text.show_details}</button>`,
    '</div>',
    `<div class="${constants.dom_classes.div_media_details}" style="display:none">`,
      `<pre>${JSON.stringify(format, null, 2)}</pre>`,
    '</div>'
  ]

  return make_element('li', inner_html.join("\n"))
}

const format_subset_to_tablerows__ybd_project = (format) => {
  const rows = []

  if (format.mimeType)
    rows.push(['mime type', format.mimeType])
  if (format.bitrate) {
    let value = Math.floor(format.bitrate / 1000) + ' kbps'

    rows.push(['bitrate', value])
  }
  if (format.hasAudio && format.audioBitrate) {
    let value = format.audioBitrate + ' kbps'

    if (format.bitrate) {
      if (format.hasVideo)
        rows.push(['audio bitrate', value])
      else
        rows[rows.length - 1][1] = value
    }
    else {
      rows.push(['bitrate', value])
    }
  }
  if (format.hasVideo) {
    if (format.quality && format.quality.label)
      rows.push(['video quality', format.quality.label])
    if (format.codec && format.codec.video)
      rows.push(['video codec', format.codec.video])
  }
  if (format.hasAudio) {
    if (format.codec && format.codec.audio)
      rows.push(['audio codec', format.codec.audio])
  }

  return rows.length
    ? rows.map(row => `<tr><td>${row[0]}:</td><td>${row[1]}</td></tr>`).join("\n")
    : ''
}

const format_subset_to_tablerows__distubejs = (format) => {
  const keys_whitelist = ["mimeType", "codecs", "bitrate", "qualityLabel", "audioSampleRate"]
  const keys = Object.keys(format)
  const rows = []

  for (let key of keys) {
    if ((keys_whitelist.indexOf(key) >= 0) && format[key])
      rows.push([key, format[key]])
  }

  return rows.length
    ? rows.map(row => `<tr><td>${row[0]}:</td><td>${row[1]}</td></tr>`).join("\n")
    : ''
}

const format_subset_to_tablerows = (state.library === 'ybd-project')
  ? format_subset_to_tablerows__ybd_project
  : format_subset_to_tablerows__distubejs

// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------

var insert_webcast_reloaded_div = function(block_element, video_url, vtt_url, referer_url) {
  var webcast_reloaded_div = make_webcast_reloaded_div(video_url, vtt_url, referer_url)

  if (block_element.childNodes.length)
    block_element.insertBefore(webcast_reloaded_div, block_element.childNodes[0])
  else
    block_element.appendChild(webcast_reloaded_div)
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

// ----------------------------------------------------------------------------- URL handlers

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

const redirect_to_url = (url) => {
  if (!url) return

  try {
    unsafeWindow.top.location = url
  }
  catch(e) {
    unsafeWindow.location = url
  }
}

// ----------------------------------------------------------------------------- format data structure: validation

const validate_format = (format, callback) => {
  if (!format || !format.url) {
    callback()
    return
  }

  let did_callback = false
  const do_callback = function() {
    if (did_callback) return

    did_callback = true
    callback()
  }

  const xhr = new XMLHttpRequest()
  xhr.open('HEAD', format.url, true)
  xhr.timeout = 5000
  xhr.onreadystatechange = function() {
    if (xhr.readyState === XMLHttpRequest.DONE) {
      format.urlStatus = xhr.status || 0
      do_callback()
    }
  }
  xhr.ontimeout = xhr.onerror = xhr.onabort = function() {
    format.urlStatus = format.urlStatus || 0
    do_callback()
  }
  xhr.send()
}

const validate_formats = (callback) => {
  if (!state.formats || !state.formats.length) {
    callback()
    return
  }

  let done_counter = 0
  const cb = () => {
    done_counter++

    if (done_counter === state.formats.length) {
      state.formats = state.formats.filter(format => (format.urlStatus >= 200) && (format.urlStatus < 300))
      callback()
    }
  }

  for (let format of state.formats) {
    validate_format(format, cb)
  }
}

const validate_formats_async = () => new Promise(resolve => {
  validate_formats(resolve)
})

// ----------------------------------------------------------------------------- format data structure: normalization

const mime_filetype_regex = /^(?:audio|video)\/([^;]+)(?:;.*)?$/

const normalize_formats = () => {
  if (!state.formats || !state.formats.length) return

  state.formats = state.formats
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
}

// ----------------------------------------------------------------------------- format data structure: remove duplicates

const dedupe_formats = () => {
  if (!state.formats || !state.formats.length) return

  let previous_itag = null

  state.formats = state.formats
    .filter(format => {
      if (format.itag) {
        if (format.itag === previous_itag) {
          return false
        }
        previous_itag = format.itag
      }
      return true
    })
}

// ----------------------------------------------------------------------------- bootstrap

const page_init = () => {
  debug('starting to initialize..')
  add_default_trusted_type_policy()

  add_userscripts_row_container(async () => {
    let info

    switch(state.library) {
      case 'ybd-project': {
          const ytdl = new window.Ytdl.YtdlCore({
            logDisplay: ['debug', 'info', 'success', 'warning', 'error'],
            disableInitialSetup: false,
            disableBasicCache: true,
            disableFileCache: true,
            disablePoTokenAutoGeneration: true,
            noUpdate: true
          })

          info = await ytdl.getFullInfo(window.location.href)
        }
        break

      case 'distubejs': {
          info = await window.ytdl.getInfo(window.location.href)
        }
        break
    }

    if (!info || !info.formats || !info.formats.length) return

    state.formats = info.formats
    info = null

    // important: perform validation BEFORE normalization
    // important: perform normalization BEFORE removing duplicates
    await validate_formats_async()
    normalize_formats()
    dedupe_formats()
    debug('number of formats that are both distinct and available: ' + state.formats.length)

    if (state.formats && state.formats.length) {
      add_show_media_formats_button()
    }
  })
}

if (state.library) {
  page_init()
}

// -----------------------------------------------------------------------------
