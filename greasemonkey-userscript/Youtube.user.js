// ==UserScript==
// @name         Youtube
// @description  Transfers video stream to alternate video players: WebCast-Reloaded, ExoAirPlayer.
// @version      0.1.0
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

var user_options = {
  "script_injection_delay_ms":   0,
  "open_in_webcast_reloaded":    false,
  "open_in_exoairplayer_sender": true,

  "videoFilter_includesAudio":   true,
  "videoFilter_excludesAudio":   false,
  "videoFilter_includesVideo":   true,
  "videoFilter_excludesVideo":   false,
  "videoFilter_maxHeight":       720
}

var payload = function(){
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

    let filtered = formats.filter(format => !!format.url)

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

    return (filtered.length) ? filtered[0] : null
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

  const get_hls_url = () => {
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
    return get_format_url(format)
  }

  const get_external_url = (hls_url, vtt_url, referer_url) => {
    let encoded_hls_url, encoded_vtt_url, webcast_reloaded_base, webcast_reloaded_url
    let encoded_referer_url, exoairplayer_base, exoairplayer_url

    encoded_hls_url       = encodeURIComponent(encodeURIComponent(btoa(hls_url)))
    encoded_vtt_url       = vtt_url ? encodeURIComponent(encodeURIComponent(btoa(vtt_url))) : null
    webcast_reloaded_base = {
      "https": "https://warren-bank.github.io/crx-webcast-reloaded/external_website/index.html",
      "http":  "http://webcast-reloaded.surge.sh/index.html"
    }
    webcast_reloaded_base = (hls_url.toLowerCase().indexOf('https:') === 0)
                              ? webcast_reloaded_base.https
                              : webcast_reloaded_base.http
    webcast_reloaded_url  = webcast_reloaded_base + '#/watch/' + encoded_hls_url + (encoded_vtt_url ? ('/subtitle/' + encoded_vtt_url) : '')

    referer_url           = referer_url ? referer_url : top.location.href
    encoded_referer_url   = encodeURIComponent(encodeURIComponent(btoa(referer_url)))
    exoairplayer_base     = 'http://webcast-reloaded.surge.sh/airplay_sender.html'
    exoairplayer_url      = exoairplayer_base  + '#/watch/' + encoded_hls_url + (encoded_vtt_url ? ('/subtitle/' + encoded_vtt_url) : '') + '/referer/' + encoded_referer_url

    if (window.open_in_webcast_reloaded && webcast_reloaded_url) {
      return webcast_reloaded_url
    }

    if (window.open_in_exoairplayer_sender && exoairplayer_url) {
      return exoairplayer_url
    }
  }

  const process_page = () => {
    const hls_url = get_hls_url()
    if (!hls_url)
      return

    top.location = get_external_url(hls_url)
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
    window.open_in_webcast_reloaded    = ${user_options['open_in_webcast_reloaded']}
    window.open_in_exoairplayer_sender = ${user_options['open_in_exoairplayer_sender']}

    window.videoFilter_includesAudio   = ${user_options['videoFilter_includesAudio']}
    window.videoFilter_excludesAudio   = ${user_options['videoFilter_excludesAudio']}
    window.videoFilter_includesVideo   = ${user_options['videoFilter_includesVideo']}
    window.videoFilter_excludesVideo   = ${user_options['videoFilter_excludesVideo']}
    window.videoFilter_maxHeight       = ${user_options['videoFilter_maxHeight']}
  }`
  inject_function(_function)
}

var bootstrap = function(){
  inject_options()
  inject_function(payload)
}

if (user_options['open_in_webcast_reloaded'] || user_options['open_in_exoairplayer_sender']) {
  setTimeout(
    bootstrap,
    user_options['script_injection_delay_ms']
  )
}
