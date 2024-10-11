// ==UserScript==
// @name         Youtube
// @description  Play media in external player.
// @version      1.0.2
// @match        *://youtube.googleapis.com/v/*
// @match        *://youtube.com/watch?v=*
// @match        *://youtube.com/embed/*
// @match        *://*.youtube.com/watch?v=*
// @match        *://*.youtube.com/embed/*
// @icon         https://www.youtube.com/favicon.ico
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

// based on an analysis of code in 'ytdl':
//   https://github.com/fent/node-ytdl-core/blob/master/lib/info.js
//   https://github.com/fent/node-ytdl-core/blob/master/lib/sig.js

// ----------------------------------------------------------------------------- constants

const user_options = {
  "poll_window_interval_ms":         500,
  "poll_window_timeout_ms":        30000,

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

const state = {
  "tokens":                        null
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

// ----------------------------------------------------------------------------- cipher: download necessary data

const extractTokens = (body) => {
  const jsVarStr         = '[a-zA-Z_\\$][a-zA-Z_0-9]*';
  const jsSingleQuoteStr = `'[^'\\\\]*(:?\\\\[\\s\\S][^'\\\\]*)*'`;
  const jsDoubleQuoteStr = `"[^"\\\\]*(:?\\\\[\\s\\S][^"\\\\]*)*"`;
  const jsQuoteStr       = `(?:${jsSingleQuoteStr}|${jsDoubleQuoteStr})`;
  const jsKeyStr         = `(?:${jsVarStr}|${jsQuoteStr})`;
  const jsPropStr        = `(?:\\.${jsVarStr}|\\[${jsQuoteStr}\\])`;
  const jsEmptyStr       = `(?:''|"")`;
  const reverseStr       = ':function\\(a\\)\\{' +
    '(?:return )?a\\.reverse\\(\\)' +
  '\\}';
  const sliceStr = ':function\\(a,b\\)\\{' +
    'return a\\.slice\\(b\\)' +
  '\\}';
  const spliceStr = ':function\\(a,b\\)\\{' +
    'a\\.splice\\(0,b\\)' +
  '\\}';
  const swapStr = ':function\\(a,b\\)\\{' +
    'var c=a\\[0\\];a\\[0\\]=a\\[b(?:%a\\.length)?\\];a\\[b(?:%a\\.length)?\\]=c(?:;return a)?' +
  '\\}';

  const actionsObjRegexp = new RegExp(
    `var (${jsVarStr})=\\{((?:(?:${
      jsKeyStr}${reverseStr}|${
      jsKeyStr}${sliceStr}|${
      jsKeyStr}${spliceStr}|${
      jsKeyStr}${swapStr
    }),?\\r?\\n?)+)\\};`,
  );
  const actionsFuncRegexp = new RegExp(`${`function(?: ${jsVarStr})?\\(a\\)\\{` +
      `a=a\\.split\\(${jsEmptyStr}\\);\\s*` +
      `((?:(?:a=)?${jsVarStr}`}${
    jsPropStr
  }\\(a,\\d+\\);)+)` +
      `return a\\.join\\(${jsEmptyStr}\\)` +
    `\\}`,
  );
  const reverseRegexp = new RegExp(`(?:^|,)(${jsKeyStr})${reverseStr}`, 'm');
  const sliceRegexp   = new RegExp(`(?:^|,)(${jsKeyStr})${sliceStr}`, 'm');
  const spliceRegexp  = new RegExp(`(?:^|,)(${jsKeyStr})${spliceStr}`, 'm');
  const swapRegexp    = new RegExp(`(?:^|,)(${jsKeyStr})${swapStr}`, 'm');

  const objResult  = actionsObjRegexp.exec(body);
  const funcResult = actionsFuncRegexp.exec(body);
  if (!objResult || !funcResult) { return null; }

  const obj      = objResult[1].replace(/\$/g, '\\$');
  const objBody  = objResult[2].replace(/\$/g, '\\$');
  const funcBody = funcResult[1].replace(/\$/g, '\\$');

  let result = reverseRegexp.exec(objBody);
  const reverseKey = result && result[1]
    .replace(/\$/g, '\\$')
    .replace(/\$|^'|^"|'$|"$/g, '');
  result = sliceRegexp.exec(objBody);
  const sliceKey = result && result[1]
    .replace(/\$/g, '\\$')
    .replace(/\$|^'|^"|'$|"$/g, '');
  result = spliceRegexp.exec(objBody);
  const spliceKey = result && result[1]
    .replace(/\$/g, '\\$')
    .replace(/\$|^'|^"|'$|"$/g, '');
  result = swapRegexp.exec(objBody);
  const swapKey = result && result[1]
    .replace(/\$/g, '\\$')
    .replace(/\$|^'|^"|'$|"$/g, '');

  const keys = `(${[reverseKey, sliceKey, spliceKey, swapKey].join('|')})`;
  const myreg = `(?:a=)?${obj
  }(?:\\.${keys}|\\['${keys}'\\]|\\["${keys}"\\])` +
    `\\(a,(\\d+)\\)`;
  const tokenizeRegexp = new RegExp(myreg, 'g');
  const tokens = [];
  while ((result = tokenizeRegexp.exec(funcBody)) !== null) {
    let key = result[1] || result[2] || result[3];
    switch (key) {
      case swapKey:
        tokens.push(`w${result[4]}`);
        break;
      case reverseKey:
        tokens.push('r');
        break;
      case sliceKey:
        tokens.push(`s${result[4]}`);
        break;
      case spliceKey:
        tokens.push(`p${result[4]}`);
        break;
    }
  }
  return tokens;
}

const get_tokens = async () => {
  const regexs = {
    whitespace: /[\s\t\r\n]+/g,
    jsURL:      /^.*"jsUrl":"([^"]+)".*$/
  }

  let scriptNodes, scriptNode, scriptText, jsURL

  scriptNodes = unsafeWindow.document.querySelectorAll('script:not([href])')
  for (let i=0; i < scriptNodes.length; i++) {
    scriptNode = scriptNodes[i]
    scriptText = scriptNode.innerText.replace(regexs.whitespace, ' ')
    if (regexs.jsURL.test(scriptText)) {
      jsURL = scriptText.replace(regexs.jsURL, '$1')
      break
    }
  }

  scriptNodes = null
  scriptNode  = null
  scriptText  = null

  if (!jsURL) return

  let tokens
  tokens = await fetch(jsURL)
  tokens = await tokens.text()
  tokens = extractTokens(tokens)
  if (!tokens || !Array.isArray(tokens) || !tokens.length) return

  state.tokens = tokens
}

// ----------------------------------------------------------------------------- cipher: decode individual media formats

const parse_cipher = (format) => {
  let cipher

  cipher = format.signatureCipher || format.cipher
  if (!cipher)
    return

  cipher = cipher.split('&')
  cipher = cipher.map(item => item.split('=', 2))
  cipher = cipher.filter(item => (item.length === 2))

  if (!cipher.length)
    return

  cipher.forEach(([key, val]) => {
    if (format[key] === undefined)
      format[key] = decodeURIComponent(val)
  })
}

const decipher_sig = (format) => {
  const tokens = state.tokens
  let sig      = format.s

  const swapHeadAndPosition = (arr, position) => {
    const first = arr[0];
    arr[0] = arr[position % arr.length];
    arr[position] = first;
    return arr;
  }

  sig = sig.split('');
  for (let i = 0, len = tokens.length; i < len; i++) {
    let token = tokens[i], pos;
    switch (token[0]) {
      case 'r':
        sig = sig.reverse();
        break;
      case 'w':
        pos = ~~token.slice(1);
        sig = swapHeadAndPosition(sig, pos);
        break;
      case 's':
        pos = ~~token.slice(1);
        sig = sig.slice(pos);
        break;
      case 'p':
        pos = ~~token.slice(1);
        sig.splice(0, pos);
        break;
    }
  }
  return sig.join('');
}

const decipher_url = (format) => {
  if (!state.tokens) return

  parse_cipher(format)
  if (!format.s || !format.url) return

  const sig = decipher_sig(format)

  let decodedUrl, search
  decodedUrl = format.url
  decodedUrl = new URL(decodedUrl)

  // update search
  search = new URLSearchParams((decodedUrl.search ? decodedUrl.search.slice(1) : ''))
  search.set('ratebypass', 'yes')
  search.set((format.sp ? format.sp : 'signature'), sig)
  decodedUrl.search = '?' + search.toString()

  format.url = decodedUrl.toString()
}

// ----------------------------------------------------------------------------- collect media formats

const get_player_response = () => {
  return new Promise((resolve, reject) => {
    const max_poll_window_attempts = Math.ceil(user_options.poll_window_timeout_ms / user_options.poll_window_interval_ms)
    let count_poll_window_attempts = 0

    const poll_for_data = () => {
      count_poll_window_attempts++

      if (count_poll_window_attempts <= max_poll_window_attempts) {
        if (unsafeWindow.ytInitialPlayerResponse && (typeof unsafeWindow.ytInitialPlayerResponse === 'object'))
          resolve(unsafeWindow.ytInitialPlayerResponse)
        else
          unsafeWindow.setTimeout(poll_for_data, user_options.poll_window_interval_ms)
      }
      else {
        resolve(null)
      }
    }
    poll_for_data()
  })
}

const update_format_url = (format) => {
  if (format && (typeof format === 'object') && format.url && format.mimeType) {
    let regex = /^(?:audio|video)\/([^;]+)(?:;.*)?$/
    if (regex.test(format.mimeType)) {
      format.url += '#file.' + format.mimeType.replace(regex, '$1')
    }
  }
}

const get_media_formats = async () => {
  const player_response = await get_player_response()
  const regexs = {
    mimeType: /^\s*(.*?);\s+codecs\s*=\s*"(.+)"\s*$/i
  }
  const formats = []
  let prospective_formats = []
  let matches

  if (player_response && (typeof player_response === 'object') && player_response.streamingData && (typeof player_response.streamingData === 'object')) {
    if (player_response.streamingData.hlsManifestUrl) {
      formats.push({
        url:      player_response.streamingData.hlsManifestUrl + '#video.m3u8',
        mimeType: 'application/x-mpegurl'
      })
    }
    if (player_response.streamingData.dashManifestUrl) {
      formats.push({
        url:      player_response.streamingData.dashManifestUrl + '#video.mpd',
        mimeType: 'application/dash+xml'
      })
    }
    if (player_response.streamingData.formats && Array.isArray(player_response.streamingData.formats) && player_response.streamingData.formats.length) {
      prospective_formats = [...prospective_formats, ...player_response.streamingData.formats]
    }
    if (player_response.streamingData.adaptiveFormats && Array.isArray(player_response.streamingData.adaptiveFormats) && player_response.streamingData.adaptiveFormats.length) {
      prospective_formats = [...prospective_formats, ...player_response.streamingData.adaptiveFormats]
    }
    if (prospective_formats.length) {
      for (let format of prospective_formats) {
        if (format && (typeof format === 'object')) {
          if (format.mimeType) {
            matches = regexs.mimeType.exec(format.mimeType)

            if (matches && Array.isArray(matches) && (matches.length === 3)) {
              format.mimeType = matches[1]
              format.codecs   = matches[2]
            }
          }
          if (!format.url) {
            decipher_url(format)
          }
          if (format.url && format.mimeType) {
            update_format_url(format)
            formats.push(format)
          }
        }
      }
    }
  }

  if (!formats.length)
    return null

  formats.sort((a,b) => {
    // sort formats by bitrate in decreasing order
    return (a.bitrate < b.bitrate)
      ? -1 : (a.bitrate === b.bitrate)
      ?  0 : 1
  })

  return formats
}

// ----------------------------------------------------------------------------- display results

const format_subset_to_tablerows = (format) => {
  const keys_whitelist = ["mimeType", "codecs", "bitrate", "qualityLabel", "audioSampleRate"]
  const rows = []

  for (let key in format) {
    if (keys_whitelist.indexOf(key) >= 0)
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

const rewrite_page_dom = (formats) => {
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

  for (let format of formats) {
    const li = format_to_listitem(format)
    ul.appendChild(li)
    attach_button_event_handlers_to_listitem(li, format)
    insert_webcast_reloaded_div_to_listitem(li, format)
  }
}

// ----------------------------------------------------------------------------- bootstrap

const init = async () => {
  await get_tokens()
  if (!state.tokens) return

  const formats = await get_media_formats()
  if (!formats) return

  add_default_trusted_type_policy()
  rewrite_page_dom(formats)
}

init()

// -----------------------------------------------------------------------------
