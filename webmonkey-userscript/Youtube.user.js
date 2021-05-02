// ==UserScript==
// @name         Youtube
// @description  Play media in external player.
// @version      1.0.0
// @match        *://youtube.googleapis.com/v/*
// @match        *://youtube.com/watch?v=*
// @match        *://youtube.com/embed/*
// @match        *://*.youtube.com/watch?v=*
// @match        *://*.youtube.com/embed/*
// @icon         https://www.youtube.com/favicon.ico
// @run-at       document_end
// @grant        unsafeWindow
// @homepage     https://github.com/warren-bank/crx-Youtube/tree/webmonkey-userscript/es5
// @supportURL   https://github.com/warren-bank/crx-Youtube/issues
// @downloadURL  https://github.com/warren-bank/crx-Youtube/raw/webmonkey-userscript/es5/webmonkey-userscript/Youtube.user.js
// @updateURL    https://github.com/warren-bank/crx-Youtube/raw/webmonkey-userscript/es5/webmonkey-userscript/Youtube.user.js
// @namespace    warren-bank
// @author       Warren Bank
// @copyright    Warren Bank
// ==/UserScript==

// based on an analysis of code in 'ytdl':
//   https://github.com/fent/node-ytdl-core/blob/master/lib/info.js
//   https://github.com/fent/node-ytdl-core/blob/master/lib/sig.js

// ----------------------------------------------------------------------------- constants

var user_options = {
  "poll_window_interval_ms":         500,
  "poll_window_timeout_ms":        30000,

  "redirect_to_webcast_reloaded":  true,
  "force_http":                    true,
  "force_https":                   false
}

var strings = {
  "buttons": {
    "start_media":                 "Start Media",
    "show_details":                "Show Details"
  }
}

var constants = {
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

var state = {
  "tokens":                        null
}

// ----------------------------------------------------------------------------- helpers

var make_element = function(elementName, html) {
  var el = unsafeWindow.document.createElement(elementName)

  if (html)
    el.innerHTML = html

  return el
}

// -----------------------------------------------------------------------------

// make GET request, pass plaintext response to callback
var download_text = function(url, headers, callback) {
  var xhr = new unsafeWindow.XMLHttpRequest()
  xhr.open("GET", url, true, null, null)

  if (headers && (typeof headers === 'object')) {
    var keys = Object.keys(headers)
    var key, val
    for (var i=0; i < keys.length; i++) {
      key = keys[i]
      val = headers[key]
      xhr.setRequestHeader(key, val)
    }
  }

  xhr.onload = function(e) {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        callback(xhr.responseText)
      }
    }
  }

  xhr.send()
}

// -----------------------------------------------------------------------------

var parse_url = function(href) {
  var parsed_url = {url: href, search: {}}
  var index, query, vars, pair, name, value

  index = href.indexOf('?')
  if (index === -1) return parsed_url

  parsed_url.url = href.substr(0, index)
  query = href.substr(index + 1)

  vars = query.split('&')
  for (var i=0; i < vars.length; i++) {
    pair = vars[i].split('=')
    if (pair.length === 2) {
      name  = pair[0]
      value = pair[1]
      parsed_url.search[name] = decodeURIComponent(value)
    }
  }

  return parsed_url
}

var reconstitute_parsed_url = function(parsed_url) {
  if (!parsed_url || (typeof parsed_url !== 'object') || !parsed_url.url) return null

  if (!parsed_url.search || (typeof parsed_url.search !== 'object')) return parsed_url.url

  var search_keys = Object.keys(parsed_url.search)
  if (!search_keys.length) return parsed_url.url

  var vars = []
  var name, value, pair
  for (var i=0; i < search_keys.length; i++) {
    name  = search_keys[i]
    value = parsed_url.search[name]
    pair  = name + '=' + encodeURIComponent(value)
    vars.push(pair)
  }

  return parsed_url.url + '?' + vars.join('&')
}

// ----------------------------------------------------------------------------- URL links to tools on Webcast Reloaded website

var get_webcast_reloaded_url = function(video_url, vtt_url, referer_url, force_http, force_https) {
  force_http  = (typeof force_http  === 'boolean') ? force_http  : user_options.force_http
  force_https = (typeof force_https === 'boolean') ? force_https : user_options.force_https

  var encoded_video_url, encoded_vtt_url, encoded_referer_url, webcast_reloaded_base, webcast_reloaded_url

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

var get_webcast_reloaded_url_chromecast_sender = function(video_url, vtt_url, referer_url) {
  return get_webcast_reloaded_url(video_url, vtt_url, referer_url, /* force_http= */ null, /* force_https= */ null).replace('/index.html', '/chromecast_sender.html')
}

var get_webcast_reloaded_url_airplay_sender = function(video_url, vtt_url, referer_url) {
  return get_webcast_reloaded_url(video_url, vtt_url, referer_url, /* force_http= */ true, /* force_https= */ false).replace('/index.html', '/airplay_sender.es5.html')
}

var get_webcast_reloaded_url_proxy = function(hls_url, vtt_url, referer_url) {
  return get_webcast_reloaded_url(hls_url, vtt_url, referer_url, /* force_http= */ true, /* force_https= */ false).replace('/index.html', '/proxy.html')
}

var make_webcast_reloaded_div = function(video_url, vtt_url, referer_url) {
  var webcast_reloaded_urls = {
//  "index":             get_webcast_reloaded_url(                  video_url, vtt_url, referer_url),
    "chromecast_sender": get_webcast_reloaded_url_chromecast_sender(video_url, vtt_url, referer_url),
    "airplay_sender":    get_webcast_reloaded_url_airplay_sender(   video_url, vtt_url, referer_url),
    "proxy":             get_webcast_reloaded_url_proxy(            video_url, vtt_url, referer_url)
  }

  var div = make_element('div')

  var html = [
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

var redirect_to_url = function(url) {
  if (!url) return

  try {
    unsafeWindow.top.location = url
  }
  catch(e) {
    unsafeWindow.location = url
  }
}

var process_video_url = function(video_url, video_type, vtt_url, referer_url) {
  if (!referer_url)
    referer_url = unsafeWindow.location.href

  if (typeof GM_startIntent === 'function') {
    // running in Android-WebMonkey: open Intent chooser

    var args = [
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

    GM_startIntent.apply(this, args)
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

var extractTokens = function(body) {
  var jsVarStr         = '[a-zA-Z_\\$][a-zA-Z_0-9]*';
  var jsSingleQuoteStr = "'[^'\\\\]*(:?\\\\[\\s\\S][^'\\\\]*)*'";
  var jsDoubleQuoteStr = '"[^"\\\\]*(:?\\\\[\\s\\S][^"\\\\]*)*"';
  var jsQuoteStr       = '(?:' + jsSingleQuoteStr + '|' + jsDoubleQuoteStr + ')';
  var jsKeyStr         = '(?:' + jsVarStr + '|' + jsQuoteStr + ')';
  var jsPropStr        = '(?:\\.' + jsVarStr + '|\\[' + jsQuoteStr + '\\])';
  var jsEmptyStr       = "(?:''|" + '"")';
  var reverseStr       = ':function\\(a\\)\\{' +
    '(?:return )?a\\.reverse\\(\\)' +
  '\\}';
  var sliceStr = ':function\\(a,b\\)\\{' +
    'return a\\.slice\\(b\\)' +
  '\\}';
  var spliceStr = ':function\\(a,b\\)\\{' +
    'a\\.splice\\(0,b\\)' +
  '\\}';
  var swapStr = ':function\\(a,b\\)\\{' +
    'var c=a\\[0\\];a\\[0\\]=a\\[b(?:%a\\.length)?\\];a\\[b(?:%a\\.length)?\\]=c(?:;return a)?' +
  '\\}';

  var actionsObjRegexp = new RegExp(
    'var (' + jsVarStr + ')=\\{((?:(?:' +
      jsKeyStr + reverseStr + '|' +
      jsKeyStr + sliceStr   + '|' +
      jsKeyStr + spliceStr  + '|' +
      jsKeyStr + swapStr    +
    '),?\\r?\\n?)+)\\};'
  );
  var actionsFuncRegexp = new RegExp(
    'function(?: ' + jsVarStr + ')?\\(a\\)\\{' + 'a=a\\.split\\(' + jsEmptyStr + '\\);\\s*' + '((?:(?:a=)?' + jsVarStr + jsPropStr + '\\(a,\\d+\\);)+)' + 'return a\\.join\\(' + jsEmptyStr + '\\)' + '\\}'
  );
  var reverseRegexp = new RegExp('(?:^|,)(' + jsKeyStr + ')' + reverseStr, 'm');
  var sliceRegexp   = new RegExp('(?:^|,)(' + jsKeyStr + ')' + sliceStr,   'm');
  var spliceRegexp  = new RegExp('(?:^|,)(' + jsKeyStr + ')' + spliceStr,  'm');
  var swapRegexp    = new RegExp('(?:^|,)(' + jsKeyStr + ')' + swapStr,    'm');

  var objResult  = actionsObjRegexp.exec(body);
  var funcResult = actionsFuncRegexp.exec(body);
  if (!objResult || !funcResult) { return null; }

  var obj      = objResult[1].replace(/\$/g,  '\\$');
  var objBody  = objResult[2].replace(/\$/g,  '\\$');
  var funcBody = funcResult[1].replace(/\$/g, '\\$');

  var result = reverseRegexp.exec(objBody);
  var reverseKey = result && result[1]
    .replace(/\$/g, '\\$')
    .replace(/\$|^'|^"|'$|"$/g, '');
  result = sliceRegexp.exec(objBody);
  var sliceKey = result && result[1]
    .replace(/\$/g, '\\$')
    .replace(/\$|^'|^"|'$|"$/g, '');
  result = spliceRegexp.exec(objBody);
  var spliceKey = result && result[1]
    .replace(/\$/g, '\\$')
    .replace(/\$|^'|^"|'$|"$/g, '');
  result = swapRegexp.exec(objBody);
  var swapKey = result && result[1]
    .replace(/\$/g, '\\$')
    .replace(/\$|^'|^"|'$|"$/g, '');

  var keys = '(' + [reverseKey, sliceKey, spliceKey, swapKey].join('|') + ')';
  var myreg = '(?:a=)?' + obj + '(?:\\.' + keys + "|\\['" + keys + "'\\]" + '|\\["' + keys + '"\\])' + '\\(a,(\\d+)\\)';
  var tokenizeRegexp = new RegExp(myreg, 'g');
  var tokens = [];
  var key
  while ((result = tokenizeRegexp.exec(funcBody)) !== null) {
    key = result[1] || result[2] || result[3];

    if (key === swapKey)
      tokens.push('w' + result[4]);
    else if (key === reverseKey)
      tokens.push('r');
    else if (key === sliceKey)
      tokens.push('s' + result[4]);
    else if (key === spliceKey)
      tokens.push('p' + result[4]);
  }
  return tokens;
}

var get_tokens = function(callback) {
  var regexs = {
    whitespace: /[\s\t\r\n]+/g,
    jsURL:      /^.*"jsUrl":"([^"]+)".*$/
  }

  var jsURL
  jsURL = unsafeWindow.document.querySelector('#player > #player-wrap > #player-api').parentNode.querySelector(':scope > script')
  if (!jsURL) return
  jsURL = jsURL.innerText.replace(regexs.whitespace, ' ')
  if (!regexs.jsURL.test(jsURL)) return
  jsURL = jsURL.replace(regexs.jsURL, '$1')

  download_text(jsURL, null, function(tokens) {
    tokens = extractTokens(tokens)
    if (!tokens || !Array.isArray(tokens) || !tokens.length) return

    state.tokens = tokens
    callback()
  })
}

// ----------------------------------------------------------------------------- cipher: decode individual media formats

var parse_cipher = function(format) {
  var cipher, key, val

  cipher = format.signatureCipher || format.cipher
  if (!cipher)
    return

  cipher = cipher.split('&')
  cipher = cipher.map(function(item) {return item.split('=', 2)})
  cipher = cipher.filter(function(item) {return (item.length === 2)})

  if (!cipher.length)
    return

  for (var i=0; i < cipher.length; i++) {
    key = cipher[i][0]
    val = cipher[i][1]

    if (typeof format[key] === 'undefined')
      format[key] = decodeURIComponent(val)
  }
}

var decipher_sig = function(format) {
  var tokens = state.tokens
  var len    = tokens.length
  var sig    = format.s
  var token, pos

  var swapHeadAndPosition = function(arr, position) {
    var first = arr[0];
    arr[0] = arr[position % arr.length];
    arr[position] = first;
    return arr;
  }

  sig = sig.split('');
  for (var i=0; i < len; i++) {
    token = tokens[i];
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

var decipher_url = function(format) {
  if (!state.tokens) return

  parse_cipher(format)
  if (!format.s || !format.url) return

  var sig = decipher_sig(format)

  var decodedUrl = parse_url(format.url)
  decodedUrl.search['ratebypass'] = 'yes'
  decodedUrl.search[(format.sp ? format.sp : 'signature')] = sig
  format.url = reconstitute_parsed_url(decodedUrl)
}

// ----------------------------------------------------------------------------- collect media formats

var get_player_response = function(callback) {
  var max_poll_window_attempts = Math.ceil(user_options.poll_window_timeout_ms / user_options.poll_window_interval_ms)
  var count_poll_window_attempts = 0

  var poll_for_data = function() {
    count_poll_window_attempts++

    if (count_poll_window_attempts <= max_poll_window_attempts) {
      if (unsafeWindow.ytInitialPlayerResponse && (typeof unsafeWindow.ytInitialPlayerResponse === 'object'))
        callback(unsafeWindow.ytInitialPlayerResponse)
      else
        unsafeWindow.setTimeout(poll_for_data, user_options.poll_window_interval_ms)
    }
  }
  poll_for_data()
}

var update_format_url = function(format) {
  if (format && (typeof format === 'object') && format.url && format.mimeType) {
    var regex = /^(?:audio|video)\/([^;]+)(?:;.*)?$/
    if (regex.test(format.mimeType)) {
      format.url += '#file.' + format.mimeType.replace(regex, '$1')
    }
  }
}

var get_media_formats = function(callback) {
  get_player_response(function(player_response) {
    var regexs = {
      mimeType: /^\s*(.*?);\s+codecs\s*=\s*"(.+)"\s*$/i
    }
    var formats = []
    var prospective_formats = []
    var format, matches

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
        prospective_formats = prospective_formats.concat(player_response.streamingData.formats)
      }
      if (player_response.streamingData.adaptiveFormats && Array.isArray(player_response.streamingData.adaptiveFormats) && player_response.streamingData.adaptiveFormats.length) {
        prospective_formats = prospective_formats.concat(player_response.streamingData.adaptiveFormats)
      }
      if (prospective_formats.length) {
        for (var i=0; i < prospective_formats.length; i++) {
          format = prospective_formats[i]

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

    formats.sort(function(a,b) {
      // sort formats by bitrate in decreasing order
      return (a.bitrate < b.bitrate)
        ? -1 : (a.bitrate === b.bitrate)
        ?  0 : 1
    })

    callback(formats)
  })
}

// ----------------------------------------------------------------------------- display results

var format_subset_to_tablerows = function(format) {
  var keys_whitelist = ["mimeType", "codecs", "bitrate", "qualityLabel", "audioSampleRate"]
  var keys = Object.keys(format)
  var rows = []
  var key

  for (var i=0; i < keys.length; i++) {
    key = keys[i]

    if (keys_whitelist.indexOf(key) >= 0)
      rows.push([key, format[key]])
  }

  return rows.length
    ? rows.map(function(row) {return '<tr><td>' + row[0] + ':</td><td>' + row[1] + '</td></tr>'}).join("\n")
    : ''
}

var format_to_listitem = function(format) {
  var inner_html = [
    '<div class="' + constants.dom_classes.div_media_summary + '">',
      '<table>',
        format_subset_to_tablerows(format),
      '</table>',
    '</div>',
    '<div class="' + constants.dom_classes.div_media_buttons + '">',
      '<button class="' + constants.dom_classes.btn_start_media  + '">' + strings.buttons.start_media  + '</button>',
      '<button class="' + constants.dom_classes.btn_show_details + '">' + strings.buttons.show_details + '</button>',
    '</div>',
    '<div class="' + constants.dom_classes.div_media_details + '" style="display:none">',
      '<pre>' + JSON.stringify(format, null, 2) + '</pre>',
    '</div>'
  ]

  return make_element('li', inner_html.join("\n"))
}

var attach_button_event_handlers_to_listitem = function(li, format) {
  var button_start_media  = li.querySelector('button.' + constants.dom_classes.btn_start_media)
  var button_show_details = li.querySelector('button.' + constants.dom_classes.btn_show_details)
  var div_media_details   = li.querySelector('div.'    + constants.dom_classes.div_media_details)

  button_start_media.addEventListener('click', function() {
    var video_url   = format.url
    var video_type  = format.mimeType
    var vtt_url     = null
    var referer_url = unsafeWindow.location.href

    process_video_url(video_url, video_type, vtt_url, referer_url)
  })

  button_show_details.addEventListener('click', function() {
    div_media_details.style.display = (div_media_details.style.display === 'none') ? 'block' : 'none'
  })
}

var insert_webcast_reloaded_div_to_listitem = function(li, format) {
  var block_element = li.querySelector('div.' + constants.dom_classes.div_media_summary)
  var video_url     = format.url
  var vtt_url       = null
  var referer_url   = unsafeWindow.location.href

  insert_webcast_reloaded_div(block_element, video_url, vtt_url, referer_url)
}

var rewrite_page_dom = function(formats) {
  var head  = unsafeWindow.document.getElementsByTagName('head')[0]
  var body  = unsafeWindow.document.body
  var title = unsafeWindow.document.title

  var html = {
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
    html.head.unshift('<title>'   + title + '</title>')
    html.body.unshift('<div><h2>' + title + '</h2></div>')
  }

  head.innerHTML = '' + html.head.join("\n")
  body.innerHTML = '' + html.body.join("\n")

  var ul = body.querySelector('ul')
  if (!ul) return

  var format, li
  for (var i=0; i < formats.length; i++) {
    format = formats[i]
    li     = format_to_listitem(format)

    ul.appendChild(li)
    attach_button_event_handlers_to_listitem(li, format)
    insert_webcast_reloaded_div_to_listitem(li, format)
  }
}

// ----------------------------------------------------------------------------- bootstrap

var init = function() {
  get_tokens(function() {
    if (!state.tokens) return

    get_media_formats(function(formats) {
      if (!formats) return

      rewrite_page_dom(formats)
    })
  })
}

init()

// -----------------------------------------------------------------------------
