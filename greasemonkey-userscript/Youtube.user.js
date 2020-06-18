// ==UserScript==
// @name         Youtube
// @description  Transfers video stream to alternate video players: WebCast-Reloaded, ExoAirPlayer.
// @version      0.2.1
// @match        *://youtube.googleapis.com/v/*
// @match        *://youtube.com/watch?v=*
// @match        *://youtube.com/embed/*
// @match        *://*.youtube.com/watch?v=*
// @match        *://*.youtube.com/embed/*
// @icon         https://www.youtube.com/favicon.ico
// @run-at       document_end
// @homepage     https://github.com/warren-bank/crx-Youtube/tree/greasemonkey-userscript
// @supportURL   https://github.com/warren-bank/crx-Youtube/issues
// @downloadURL  https://github.com/warren-bank/crx-Youtube/raw/greasemonkey-userscript/greasemonkey-userscript/Youtube.user.js
// @updateURL    https://github.com/warren-bank/crx-Youtube/raw/greasemonkey-userscript/greasemonkey-userscript/Youtube.user.js
// @namespace    warren-bank
// @author       Warren Bank
// @copyright    Warren Bank
// ==/UserScript==

// https://www.chromium.org/developers/design-documents/user-scripts

// based on an analysis of code in 'ytdl':
//   https://github.com/fent/node-ytdl-core/blob/master/lib/info.js
//   https://github.com/fent/node-ytdl-core/blob/master/lib/sig.js

var user_options = {
  "script_injection_delay_ms":    0,
  "redirect_to_webcast_reloaded": true,
  "force_http":                   true,
  "force_https":                  false,

  "videoFilter_includesAudio":    true,
  "videoFilter_excludesAudio":    false,
  "videoFilter_includesVideo":    true,
  "videoFilter_excludesVideo":    false,
  "videoFilter_maxHeight":        720
}

var payload = function(){

  // -----------------------------------------------------------------------------------------------
  // sig.js
  // -----------------------------------------------------------------------------------------------
  const process_cipher_format = async (format, html5playerfile) => {

    const parse_cipher_format = () => {
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

    const download_file = async (url) => {
      let response
      response = await fetch(html5playerfile)
      response = await response.text()
      return response
    }

    const extractActions = (body) => {
      const jsVarStr = '[a-zA-Z_\\$][a-zA-Z_0-9]*';
      const jsSingleQuoteStr = `'[^'\\\\]*(:?\\\\[\\s\\S][^'\\\\]*)*'`;
      const jsDoubleQuoteStr = `"[^"\\\\]*(:?\\\\[\\s\\S][^"\\\\]*)*"`;
      const jsQuoteStr = `(?:${jsSingleQuoteStr}|${jsDoubleQuoteStr})`;
      const jsKeyStr = `(?:${jsVarStr}|${jsQuoteStr})`;
      const jsPropStr = `(?:\\.${jsVarStr}|\\[${jsQuoteStr}\\])`;
      const jsEmptyStr = `(?:''|"")`;
      const reverseStr = ':function\\(a\\)\\{' +
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
      const sliceRegexp = new RegExp(`(?:^|,)(${jsKeyStr})${sliceStr}`, 'm');
      const spliceRegexp = new RegExp(`(?:^|,)(${jsKeyStr})${spliceStr}`, 'm');
      const swapRegexp = new RegExp(`(?:^|,)(${jsKeyStr})${swapStr}`, 'm');

      const objResult = actionsObjRegexp.exec(body);
      const funcResult = actionsFuncRegexp.exec(body);
      if (!objResult || !funcResult) { return null; }

      const obj = objResult[1].replace(/\$/g, '\\$');
      const objBody = objResult[2].replace(/\$/g, '\\$');
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

    const decipher = (tokens, sig) => {
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

    const setDownloadURL = (format, sig) => {
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

    try {
      parse_cipher_format()

      if (!format.s || !format.url)
        throw ''

      const html5player = await download_file(html5playerfile)
      const tokens      = extractActions(html5player)

      if (!tokens || !tokens.length)
        throw ''

      const sig = decipher(tokens, format.s)

      setDownloadURL(format, sig)
    }
    catch(e) {
      format.url = null
    }
  }

  // -----------------------------------------------------------------------------------------------
  // info.js
  // -----------------------------------------------------------------------------------------------

  const parseFormats = (info) => {
    let formats = []
    if (info.player_response.streamingData) {
      if (info.player_response.streamingData.hlsManifestUrl) {
        formats.push({url: info.player_response.streamingData.hlsManifestUrl + '#video.m3u8'})
      }
      else if (info.player_response.streamingData.dashManifestUrl) {
        formats.push({url: info.player_response.streamingData.dashManifestUrl + '#video.mpd'})
      }
      else {
        if (info.player_response.streamingData.formats) {
          formats = formats.concat(info.player_response.streamingData.formats)
        }
        if (info.player_response.streamingData.adaptiveFormats) {
          formats = formats.concat(info.player_response.streamingData.adaptiveFormats)
        }
      }
    }
    return formats
  }

  const filterFormats = (formats) => {
    if (!formats || !formats.length)
      return null

    if (formats.length === 1)
      return formats[0]

    let filtered = [...formats]

    if (window.videoFilter_includesAudio) {
      // example: true
      filtered = filtered.filter(format => !!format.audioChannels)
    }

    if (window.videoFilter_excludesAudio) {
      // example: true
      filtered = filtered.filter(format => !format.audioChannels)
    }

    if (window.videoFilter_includesVideo) {
      // example: true
      filtered = filtered.filter(format => !!format.height)
    }

    if (window.videoFilter_excludesVideo) {
      // example: true
      filtered = filtered.filter(format => !format.height)
    }

    if (window.videoFilter_includesVideo && window.videoFilter_maxHeight) {
      // example: 720
      filtered = filtered.filter(format => format.height && format.height >= window.videoFilter_maxHeight)
    }

    filtered.sort((a,b) => {
      // sort remaining formats by bitrate in decreasing order, then return the first element (ie: highest bitrate)
      return (a.bitrate < b.bitrate)
        ? -1 : (a.bitrate === b.bitrate)
        ?  0 : 1
    })

    let noncipher = filtered.filter(format => !!format.url)
    if (noncipher.length)
      return noncipher[0]
    if (filtered.length)
      return filtered[0]

    // no matches
    return null
  }

  const get_format_url = (format) => {
    if (!format || !format.url) return null

    let url = format.url

    if (format.mimeType) {
      let regex = /^(?:audio|video)\/([^;]+)(?:;.*)?$/
      if (regex.test(format.mimeType))
        url += '#file.' + format.mimeType.replace(regex, '$1')
    }
    return url
  }

  const get_hls_url = async () => {
    let $scripts, script, config, player_response, formats, format

    try {
      $scripts = [...document.querySelector('#player > #player-wrap > #player-api').parentNode.querySelectorAll(':scope > script')]
    }
    catch(e){}

    if (!$scripts || !$scripts.length)
      $scripts = [...document.querySelectorAll('script:not([src])')]

    if (!$scripts || !$scripts.length)
      return

    $scripts.forEach(el => {
      if (config)
        return

      script = el.innerHTML.trim()
      if (script.indexOf('var ytplayer') === -1)
        return

      try {
        script = script.replace(/[\r\n]+/g, ' ')
        script = script.replace(/^.*ytplayer\.config\s*=\s*/, '').replace(/(\})(?:;?\s*ytplayer.*)?$/, '$1')
        script = JSON.parse(script)
        config = script
      }
      catch(e){}
    })

    if (!config)
      return

    try {
      player_response = config.args.player_response
      player_response = JSON.parse(player_response)

      if (player_response.playabilityStatus === 'UNPLAYABLE')
        return

      formats = parseFormats({player_response})
    }
    catch(e){}

    format = filterFormats(formats)

    if (!format)
      return

    if (!format.url) {
      // attempt to decipher
      const html5playerfile = (new URL(config.assets.js, top.location.href)).href
      await process_cipher_format(format, html5playerfile)
    }

    if (!format.url)
      return

    return get_format_url(format)
  }

  // -----------------------------------------------------------------------------------------------
  // extension-specific logic
  // -----------------------------------------------------------------------------------------------

  const get_referer_url = function() {
    let referer_url
    try {
      referer_url = top.location.href
    }
    catch(e) {
      referer_url = window.location.href
    }
    return referer_url
  }

  const get_webcast_reloaded_url = (hls_url, vtt_url, referer_url) => {
    let encoded_hls_url, encoded_vtt_url, encoded_referer_url, webcast_reloaded_base, webcast_reloaded_url

    encoded_hls_url       = encodeURIComponent(encodeURIComponent(btoa(hls_url)))
    encoded_vtt_url       = vtt_url ? encodeURIComponent(encodeURIComponent(btoa(vtt_url))) : null
    referer_url           = referer_url ? referer_url : get_referer_url()
    encoded_referer_url   = encodeURIComponent(encodeURIComponent(btoa(referer_url)))

    webcast_reloaded_base = {
      "https": "https://warren-bank.github.io/crx-webcast-reloaded/external_website/index.html",
      "http":  "http://webcast-reloaded.surge.sh/index.html"
    }

    webcast_reloaded_base = (window.force_http)
                              ? webcast_reloaded_base.http
                              : (window.force_https)
                                 ? webcast_reloaded_base.https
                                 : (hls_url.toLowerCase().indexOf('http:') === 0)
                                    ? webcast_reloaded_base.http
                                    : webcast_reloaded_base.https

    webcast_reloaded_url  = webcast_reloaded_base + '#/watch/' + encoded_hls_url + (encoded_vtt_url ? ('/subtitle/' + encoded_vtt_url) : '') + '/referer/' + encoded_referer_url
    return webcast_reloaded_url
  }

  const redirect_to_url = function(url) {
    if (!url) return

    try {
      top.location = url
    }
    catch(e) {
      window.location = url
    }
  }

  const process_video_url = (hls_url) => {
    if (hls_url && window.redirect_to_webcast_reloaded) {
      // transfer video stream

      redirect_to_url(get_webcast_reloaded_url(hls_url))
    }
  }

  // -----------------------------------------------------------------------------------------------
  // bootstrap
  // -----------------------------------------------------------------------------------------------

  const process_page = async () => {
    const hls_url = await get_hls_url()

    process_video_url(hls_url)
  }

  process_page()
}

var get_hash_code = function(str){
  var hash, i, char
  hash = 0
  if (str.length == 0) {
    return hash
  }
  for (i = 0; i < str.length; i++) {
    char = str.charCodeAt(i)
    hash = ((hash<<5)-hash)+char
    hash = hash & hash  // Convert to 32bit integer
  }
  return Math.abs(hash)
}

var inject_function = function(_function){
  var inline, script, head

  inline = _function.toString()
  inline = '(' + inline + ')()' + '; //# sourceURL=crx_extension.' + get_hash_code(inline)
  inline = document.createTextNode(inline)

  script = document.createElement('script')
  script.appendChild(inline)

  head = document.head
  head.appendChild(script)
}

var inject_options = function(){
  var _function = `function(){
    window.redirect_to_webcast_reloaded = ${user_options['redirect_to_webcast_reloaded']}
    window.force_http                   = ${user_options['force_http']}
    window.force_https                  = ${user_options['force_https']}

    window.videoFilter_includesAudio    = ${user_options['videoFilter_includesAudio']}
    window.videoFilter_excludesAudio    = ${user_options['videoFilter_excludesAudio']}
    window.videoFilter_includesVideo    = ${user_options['videoFilter_includesVideo']}
    window.videoFilter_excludesVideo    = ${user_options['videoFilter_excludesVideo']}
    window.videoFilter_maxHeight        = ${user_options['videoFilter_maxHeight']}
  }`
  inject_function(_function)
}

var bootstrap = function(){
  inject_options()
  inject_function(payload)
}

if (user_options['redirect_to_webcast_reloaded']) {
  setTimeout(
    bootstrap,
    user_options['script_injection_delay_ms']
  )
}
