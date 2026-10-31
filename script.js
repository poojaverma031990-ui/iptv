/**
 * IPTV Country Engine - 2012 Android 4.4 KitKat ES5 Compatible
 * Supports Country Dropdown Selector with India as default, and Entertainment, Kids, News, Sports subcategories
 */
(function() {
  var COLOR_PALETTE = [
    '#00f2fe', '#138808', '#000080', '#b91c1c', '#0284c7', '#0d9488', '#9333ea', '#ca8a04'
  ];

  var INDIA_DEFAULT_CHANNELS = [
    {
      id: 'india-news-1',
      name: 'NDTV 24x7 (India)',
      category: 'news',
      logo: '',
      url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
    },
    {
      id: 'india-sport-1',
      name: 'Sports India Live',
      category: 'sports',
      logo: '',
      url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
    },
    {
      id: 'india-kids-1',
      name: 'Kids India Toons',
      category: 'kids',
      logo: '',
      url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
    },
    {
      id: 'india-ent-1',
      name: 'Zee TV / Entertainment India',
      category: 'entertainment',
      logo: '',
      url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
    }
  ];

  var channels = INDIA_DEFAULT_CHANNELS.slice(0);
  var filteredChannels = [];
  var activeChannel = null;
  var currentCategory = 'all';
  var renderedCount = 0;
  var BATCH_SIZE = 40;
  var hlsInstance = null;
  var isPseudoFullscreen = false;
  var isRendering = false;

  var videoPlayer = document.getElementById('main-player');
  var videoWrapper = document.getElementById('video-wrapper');
  var channelListContainer = document.getElementById('channel-list');
  var categoryTabs = document.getElementById('category-tabs');
  var searchInput = document.getElementById('search-input');
  var channelCountDisplay = document.getElementById('channel-count-display');
  var playlistNameDisplay = document.getElementById('playlist-name');
  var loadingOverlay = document.getElementById('loading-overlay');
  var loadingMsg = document.getElementById('loading-msg');
  var countryDropdown = document.getElementById('country-dropdown');
  var headerRegionBadge = document.getElementById('header-region-badge');
  var liveBadgeText = document.getElementById('live-badge-text');

  var btnPlayPause = document.getElementById('btn-play-pause');
  var btnMute = document.getElementById('btn-mute');
  var volumeBar = document.getElementById('volume-bar');
  var btnFullscreen = document.getElementById('btn-fullscreen');
  var fullscreenIcon = document.getElementById('fullscreen-icon');
  var btnPip = document.getElementById('btn-pip');
  var btnExternalPlayer = document.getElementById('btn-external-player');
  var btnRefresh = document.getElementById('btn-refresh');
  
  var currentLogo = document.getElementById('current-ch-logo');
  var currentMonogram = document.getElementById('current-ch-monogram');
  var currentTitle = document.getElementById('current-ch-title');
  var currentCat = document.getElementById('current-ch-cat');
  var currentSource = document.getElementById('current-ch-source');
  
  var modalM3u = document.getElementById('modal-m3u');
  var btnLoadM3u = document.getElementById('btn-load-m3u');
  var btnCancelModal = document.getElementById('btn-cancel-modal');
  var btnSubmitM3u = document.getElementById('btn-submit-m3u');
  var m3uUrlInput = document.getElementById('m3u-url-input');
  var toastMsg = document.getElementById('toast-msg');

  function getChannelMonogram(name) {
    if (!name) return 'TV';
    var clean = name.replace(/[^a-zA-Z0-9 ]/g, '').trim();
    var parts = clean.split(/\s+/);
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    return clean.substring(0, 2).toUpperCase() || 'TV';
  }

  function getChannelColor(name) {
    var hash = 0;
    for (var i = 0; i < (name || '').length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    var idx = Math.abs(hash) % COLOR_PALETTE.length;
    return COLOR_PALETTE[idx];
  }

  function getCategoryIcon(cat) {
    var c = (cat || '').toLowerCase();
    if (c.indexOf('news') !== -1) return 'fa-solid fa-newspaper';
    if (c.indexOf('movie') !== -1 || c.indexOf('cinema') !== -1) return 'fa-solid fa-film';
    if (c.indexOf('sport') !== -1) return 'fa-solid fa-futbol';
    if (c.indexOf('music') !== -1) return 'fa-solid fa-music';
    if (c.indexOf('kids') !== -1 || c.indexOf('child') !== -1) return 'fa-solid fa-child';
    if (c.indexOf('enter') !== -1) return 'fa-solid fa-tv';
    return 'fa-solid fa-globe';
  }

  function init() {
    if (!videoPlayer) return;
    setupEventListeners();
    setupTvRemoteNavigation();
    setupInfiniteScroll();
    
    // Auto load default India M3U on startup
    loadSelectedCountry('https://iptv-org.github.io/iptv/countries/in.m3u');
  }

  function loadSelectedCountry(url) {
    var selectedOptionText = countryDropdown.options[countryDropdown.selectedIndex].text;
    if (loadingOverlay) loadingOverlay.className = 'loading-overlay active';
    if (loadingMsg) loadingMsg.innerHTML = 'Loading ' + selectedOptionText + '...';

    fetchM3U(url, selectedOptionText, function(err, items) {
      if (loadingOverlay) loadingOverlay.className = 'loading-overlay';
      if (!err && items && items.length > 0) {
        channels = items;
        if (playlistNameDisplay) playlistNameDisplay.innerHTML = selectedOptionText;
        if (headerRegionBadge) headerRegionBadge.innerHTML = selectedOptionText.replace(/[^a-zA-Z]/g, '').substring(0, 5).toUpperCase();
        if (liveBadgeText) liveBadgeText.innerHTML = 'LIVE ' + selectedOptionText.toUpperCase();
        playChannel(channels[0]);
        applyFilterAndRender();
        showToast('Loaded ' + items.length + ' channels for ' + selectedOptionText + '!');
      } else {
        channels = INDIA_DEFAULT_CHANNELS.slice(0);
        if (playlistNameDisplay) playlistNameDisplay.innerHTML = 'India';
        if (headerRegionBadge) headerRegionBadge.innerHTML = 'INDIA';
        if (liveBadgeText) liveBadgeText.innerHTML = 'LIVE INDIA';
        playChannel(channels[0]);
        applyFilterAndRender();
        showToast('Loaded fallback channels.');
      }
    });
  }

  function playChannel(ch) {
    if (!ch) return;
    activeChannel = ch;

    if (currentTitle) currentTitle.innerHTML = ch.name;
    if (currentCat) currentCat.innerHTML = (ch.category || 'GENERAL').toUpperCase();
    if (currentSource) currentSource.innerHTML = ch.source || 'IPTV Stream';
    
    var mono = getChannelMonogram(ch.name);
    var color = getChannelColor(ch.name);
    
    if (currentMonogram) {
      currentMonogram.innerHTML = mono;
      currentMonogram.style.display = 'flex';
      currentMonogram.parentNode.style.backgroundColor = color;
    }

    if (currentLogo) {
      if (ch.logo && ch.logo.length > 5) {
        currentLogo.style.display = 'none';
        currentLogo.src = ch.logo;
        currentLogo.onload = function() {
          this.style.display = 'block';
          if (currentMonogram) currentMonogram.style.display = 'none';
        };
        currentLogo.onerror = function() {
          this.style.display = 'none';
          if (currentMonogram) currentMonogram.style.display = 'flex';
        };
      } else {
        currentLogo.style.display = 'none';
      }
    }

    var url = ch.url;
    var isHls = url.indexOf('.m3u8') !== -1;
    var isAndroid = /Android/i.test(navigator.userAgent);
    var canNativeHls = videoPlayer.canPlayType('application/vnd.apple.mpegurl') || 
                       videoPlayer.canPlayType('application/x-mpegURL');

    if (isAndroid || canNativeHls || !window.Hls) {
      if (hlsInstance) {
        try { hlsInstance.destroy(); } catch(e) {}
        hlsInstance = null;
      }
      videoPlayer.src = url;
      try { videoPlayer.play(); } catch(e) {}
    } else if (window.Hls && Hls.isSupported() && isHls) {
      if (hlsInstance) {
        try { hlsInstance.destroy(); } catch(e) {}
      }
      hlsInstance = new Hls({
        enableWorker: false,
        lowLatencyMode: true
      });
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(videoPlayer);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, function() {
        try { videoPlayer.play(); } catch(e) {}
      });
    } else {
      videoPlayer.src = url;
      try { videoPlayer.play(); } catch(e) {}
    }

    highlightActiveCard();
  }

  function applyFilterAndRender() {
    if (!channelListContainer) return;
    var query = (searchInput ? searchInput.value || '' : '').toLowerCase();
    renderedCount = 0;
    channelListContainer.innerHTML = '';

    filteredChannels = [];
    for (var i = 0; i < channels.length; i++) {
      var ch = channels[i];
      var cat = (ch.category || '').toLowerCase();
      var matchesCat = true;
      if (currentCategory !== 'all') {
        matchesCat = (cat.indexOf(currentCategory) !== -1);
      }
      var matchesQuery = !query || (ch.name.toLowerCase().indexOf(query) !== -1);
      if (matchesCat && matchesQuery) {
        filteredChannels.push(ch);
      }
    }

    if (channelCountDisplay) {
      channelCountDisplay.innerHTML = filteredChannels.length + ' channels';
    }

    if (filteredChannels.length === 0) {
      channelListContainer.innerHTML = '<div style="text-align:center; padding: 2.5rem; color: #94a3b8;">No channels found in this category</div>';
      return;
    }

    renderNextBatch();
  }

  function renderNextBatch() {
    if (isRendering || renderedCount >= filteredChannels.length) return;
    isRendering = true;

    var start = renderedCount;
    var end = Math.min(start + BATCH_SIZE, filteredChannels.length);
    var frag = document.createDocumentFragment();

    for (var i = start; i < end; i++) {
      (function(ch) {
        var isActive = activeChannel && (activeChannel.id === ch.id);
        var card = document.createElement('div');
        card.className = 'channel-card' + (isActive ? ' active' : '');
        card.setAttribute('tabindex', '0');
        card.setAttribute('data-id', ch.id);
        
        var mono = getChannelMonogram(ch.name);
        var color = getChannelColor(ch.name);
        var iconClass = getCategoryIcon(ch.category);

        var hasUrl = ch.logo && ch.logo.length > 5;
        var html = '<div class="ch-logo-wrap" style="background-color:' + color + ';">' +
                     '<div class="ch-fallback-icon"><i class="' + iconClass + '"></i></div>';

        if (hasUrl) {
          html += '<img src="' + ch.logo + '" class="ch-logo" referrerpolicy="no-referrer" style="display:none;" ' +
                  'onload="this.style.display=\'block\'; if(this.previousElementSibling) this.previousElementSibling.style.display=\'none\';" ' +
                  'onerror="this.style.display=\'none\'; if(this.previousElementSibling) this.previousElementSibling.style.display=\'flex\';">';
        }

        html += '</div>' +
                '<div class="ch-info"><div class="ch-title">' + ch.name + '</div>' +
                '<div class="ch-meta">' + (ch.category || 'General').toUpperCase() + '</div></div>' +
                '<i class="fa-solid ' + (isActive ? 'fa-volume-high' : 'fa-play') + '" style="color:#00f2fe;"></i>';
        
        card.innerHTML = html;

        card.onclick = function() {
          playChannel(ch);
        };
        frag.appendChild(card);
      })(filteredChannels[i]);
    }

    channelListContainer.appendChild(frag);
    renderedCount = end;
    isRendering = false;
  }

  function setupInfiniteScroll() {
    if (!channelListContainer) return;
    channelListContainer.addEventListener('scroll', function() {
      var scrollPos = channelListContainer.scrollTop + channelListContainer.clientHeight;
      var totalHeight = channelListContainer.scrollHeight;
      if (scrollPos >= totalHeight - 250) {
        renderNextBatch();
      }
    });
  }

  function highlightActiveCard() {
    if (!channelListContainer) return;
    var cards = channelListContainer.querySelectorAll('.channel-card');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var isCur = activeChannel && (card.getAttribute('data-id') === activeChannel.id);
      if (isCur) {
        card.className = 'channel-card active';
        var icon = card.querySelector('.fa-play, .fa-volume-high');
        if (icon) icon.className = 'fa-solid fa-volume-high';
      } else {
        card.className = 'channel-card';
        var icon = card.querySelector('.fa-volume-high, .fa-play');
        if (icon) icon.className = 'fa-solid fa-play';
      }
    }
  }

  function parseM3U(content, srcLabel) {
    var lines = content.split(/\r?\n/);
    var list = [];
    var cur = null;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/^\s+|\s+$/g, '');
      if (!line) continue;

      if (line.indexOf('#EXTINF:') === 0) {
        cur = {
          id: 'ch_' + list.length + '_' + Math.floor(Math.random() * 1000000),
          source: srcLabel || 'IPTV'
        };
        
        var logoMatch = line.match(/tvg-logo="([^"]+)"/i);
        if (logoMatch && logoMatch[1]) {
          cur.logo = logoMatch[1];
        }

        var groupMatch = line.match(/group-title="([^"]+)"/i);
        if (groupMatch && groupMatch[1]) {
          cur.category = groupMatch[1];
        } else {
          cur.category = 'General';
        }

        var commaIdx = line.lastIndexOf(',');
        if (commaIdx !== -1) {
          cur.name = line.substring(commaIdx + 1).replace(/^\s+|\s+$/g, '');
        }
      } else if (line.indexOf('#') !== 0 && cur) {
        cur.url = line;
        if (!cur.name) cur.name = 'Channel ' + (list.length + 1);
        list.push(cur);
        cur = null;
      }
    }
    return list;
  }

  function fetchM3U(url, label, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.timeout = 16000;
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) {
          var parsed = parseM3U(xhr.responseText, label);
          callback(null, parsed);
        } else {
          var proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
          var xhrProxy = new XMLHttpRequest();
          xhrProxy.open('GET', proxyUrl, true);
          xhrProxy.timeout = 16000;
          xhrProxy.onreadystatechange = function() {
            if (xhrProxy.readyState === 4) {
              if (xhrProxy.status >= 200 && xhrProxy.status < 300) {
                callback(null, parseM3U(xhrProxy.responseText, label));
              } else {
                callback('Failed to load ' + url);
              }
            }
          };
          xhrProxy.send();
        }
      }
    };
    xhr.send();
  }

  function setupTvRemoteNavigation() {
    document.addEventListener('keydown', function(e) {
      var code = e.keyCode || e.which;

      if (code === 179 || code === 85 || code === 126 || code === 127) {
        e.preventDefault();
        togglePlayPause();
        return;
      }

      if (code === 166 || code === 33) {
        e.preventDefault();
        navigateChannelDelta(-1);
        return;
      }
      if (code === 167 || code === 34) {
        e.preventDefault();
        navigateChannelDelta(1);
        return;
      }

      if (code === 24 || code === 175) {
        e.preventDefault();
        adjustVolume(0.1);
        return;
      }
      if (code === 25 || code === 174) {
        e.preventDefault();
        adjustVolume(-0.1);
        return;
      }

      if (code === 4 || code === 27 || code === 8) {
        if (isPseudoFullscreen) {
          e.preventDefault();
          exitPseudoFullscreen();
          return;
        }
        if (modalM3u && modalM3u.className.indexOf('open') !== -1) {
          e.preventDefault();
          modalM3u.className = 'modal-overlay';
          return;
        }
      }

      var active = document.activeElement;
      var focusables = document.querySelectorAll('[tabindex="0"]:not([disabled])');
      var fList = [];
      for (var i = 0; i < focusables.length; i++) {
        if (focusables[i].offsetParent !== null) {
          fList.push(focusables[i]);
        }
      }

      if (!fList.length) return;
      var curIdx = fList.indexOf(active);

      if (code === 19 || code === 38) {
        if (active && active.classList && active.classList.contains('channel-card')) {
          e.preventDefault();
          var prevCard = active.previousElementSibling;
          if (prevCard && prevCard.classList && prevCard.classList.contains('channel-card')) {
            prevCard.focus();
            if (prevCard.scrollIntoView) prevCard.scrollIntoView(false);
          } else {
            if (searchInput) searchInput.focus();
          }
        } else if (curIdx > 0) {
          e.preventDefault();
          fList[curIdx - 1].focus();
        }
      }

      else if (code === 20 || code === 40) {
        if (active && active.classList && active.classList.contains('channel-card')) {
          e.preventDefault();
          var nextCard = active.nextElementSibling;
          if (nextCard && nextCard.classList && nextCard.classList.contains('channel-card')) {
            nextCard.focus();
            if (nextCard.scrollIntoView) nextCard.scrollIntoView(false);
          } else {
            renderNextBatch();
            setTimeout(function() {
              var newlyAdded = active.nextElementSibling;
              if (newlyAdded) {
                newlyAdded.focus();
                if (newlyAdded.scrollIntoView) newlyAdded.scrollIntoView(false);
              }
            }, 50);
          }
        } else if (active === searchInput || (active && active.classList && active.classList.contains('cat-tab'))) {
          e.preventDefault();
          var firstCard = channelListContainer.querySelector('.channel-card');
          if (firstCard) {
            firstCard.focus();
            if (firstCard.scrollIntoView) firstCard.scrollIntoView(false);
          }
        } else if (curIdx < fList.length - 1) {
          e.preventDefault();
          fList[curIdx + 1].focus();
        }
      }

      else if (code === 21 || code === 37) {
        if (active && active.classList && active.classList.contains('channel-card')) {
          e.preventDefault();
          if (btnPlayPause) btnPlayPause.focus();
        } else if (active && active.classList && active.classList.contains('cat-tab')) {
          e.preventDefault();
          var prevTab = active.previousElementSibling;
          if (prevTab && prevTab.classList && prevTab.classList.contains('cat-tab')) {
            prevTab.focus();
            prevTab.click();
          }
        }
      }

      else if (code === 22 || code === 39) {
        if (active === btnPlayPause || active === btnMute || active === volumeBar || active === btnFullscreen || active === btnPip) {
          e.preventDefault();
          var firstCard = channelListContainer.querySelector('.channel-card');
          if (firstCard) firstCard.focus();
        } else if (active && active.classList && active.classList.contains('cat-tab')) {
          e.preventDefault();
          var nextTab = active.nextElementSibling;
          if (nextTab && nextTab.classList && nextTab.classList.contains('cat-tab')) {
            nextTab.focus();
            nextTab.click();
          }
        }
      }

      else if (code === 23 || code === 13 || code === 66) {
        if (active) {
          active.click();
        }
      }
    });
  }

  function navigateChannelDelta(delta) {
    if (!filteredChannels.length) return;
    var curIdx = -1;
    if (activeChannel) {
      for (var i = 0; i < filteredChannels.length; i++) {
        if (filteredChannels[i].id === activeChannel.id) {
          curIdx = i;
          break;
        }
      }
    }
    var nextIdx = curIdx + delta;
    if (nextIdx < 0) nextIdx = filteredChannels.length - 1;
    if (nextIdx >= filteredChannels.length) nextIdx = 0;
    playChannel(filteredChannels[nextIdx]);
    showToast('Channel: ' + filteredChannels[nextIdx].name);
  }

  function adjustVolume(amount) {
    if (!videoPlayer) return;
    var newVol = Math.max(0, Math.min(1, videoPlayer.volume + amount));
    videoPlayer.volume = newVol;
    if (volumeBar) volumeBar.value = newVol;
    videoPlayer.muted = (newVol === 0);
    showToast('Volume: ' + Math.round(newVol * 100) + '%');
  }

  function togglePlayPause() {
    if (!videoPlayer) return;
    if (videoPlayer.paused) {
      videoPlayer.play();
      if (btnPlayPause) btnPlayPause.innerHTML = '<i class="fa-solid fa-pause"></i>';
    } else {
      videoPlayer.pause();
      if (btnPlayPause) btnPlayPause.innerHTML = '<i class="fa-solid fa-play"></i>';
    }
  }

  function toggleFullscreen() {
    var doc = document;
    var isFull = doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || isPseudoFullscreen;
    
    if (isFull) {
      if (isPseudoFullscreen) {
        exitPseudoFullscreen();
      } else {
        if (doc.exitFullscreen) doc.exitFullscreen();
        else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
        else if (doc.mozCancelFullScreen) doc.mozCancelFullScreen();
      }
      if (fullscreenIcon) fullscreenIcon.className = 'fa-solid fa-expand';
    } else {
      var wrap = videoWrapper;
      if (wrap.requestFullscreen) {
        wrap.requestFullscreen().catch(function() { enterPseudoFullscreen(); });
        if (fullscreenIcon) fullscreenIcon.className = 'fa-solid fa-compress';
      } else if (wrap.webkitRequestFullscreen) {
        wrap.webkitRequestFullscreen();
        if (fullscreenIcon) fullscreenIcon.className = 'fa-solid fa-compress';
      } else if (videoPlayer.webkitEnterFullscreen) {
        try {
          videoPlayer.webkitEnterFullscreen();
        } catch(e) {
          enterPseudoFullscreen();
        }
      } else {
        enterPseudoFullscreen();
      }
    }
  }

  function enterPseudoFullscreen() {
    isPseudoFullscreen = true;
    if (videoWrapper) videoWrapper.className = 'video-frame-wrap pseudo-fullscreen';
    document.body.className = 'has-pseudo-fullscreen';
    if (fullscreenIcon) fullscreenIcon.className = 'fa-solid fa-compress';
  }

  function exitPseudoFullscreen() {
    isPseudoFullscreen = false;
    if (videoWrapper) videoWrapper.className = 'video-frame-wrap';
    document.body.className = '';
    if (fullscreenIcon) fullscreenIcon.className = 'fa-solid fa-expand';
  }

  function setupEventListeners() {
    if (btnPlayPause) btnPlayPause.onclick = togglePlayPause;
    
    videoPlayer.onplay = function() {
      if (btnPlayPause) btnPlayPause.innerHTML = '<i class="fa-solid fa-pause"></i>';
    };
    videoPlayer.onpause = function() {
      if (btnPlayPause) btnPlayPause.innerHTML = '<i class="fa-solid fa-play"></i>';
    };

    if (btnMute) {
      btnMute.onclick = function() {
        videoPlayer.muted = !videoPlayer.muted;
        btnMute.innerHTML = videoPlayer.muted ? '<i class="fa-solid fa-volume-xmark"></i>' : '<i class="fa-solid fa-volume-high"></i>';
      };
    }

    if (volumeBar) {
      volumeBar.oninput = function() {
        videoPlayer.volume = volumeBar.value;
        videoPlayer.muted = (volumeBar.value == 0);
      };
    }

    if (btnFullscreen) btnFullscreen.onclick = toggleFullscreen;

    if (btnPip) {
      btnPip.onclick = function() {
        if (videoPlayer.webkitSetPresentationMode) {
          var mode = videoPlayer.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture';
          videoPlayer.webkitSetPresentationMode(mode);
        } else if (document.pictureInPictureEnabled && videoPlayer.requestPictureInPicture) {
          if (document.pictureInPictureElement) {
            document.exitPictureInPicture();
          } else {
            videoPlayer.requestPictureInPicture();
          }
        } else {
          showToast('PiP mode triggered');
        }
      };
    }

    if (btnExternalPlayer) {
      btnExternalPlayer.onclick = function() {
        if (!activeChannel) return;
        showToast('Opening external player...');
        var vlcUrl = 'vlc://' + activeChannel.url;
        var intentUrl = 'intent:' + activeChannel.url + '#Intent;package=org.videolan.vlc;type=video/*;end';
        window.location.href = vlcUrl;
        setTimeout(function() {
          window.location.href = intentUrl;
        }, 600);
      };
    }

    if (btnRefresh) {
      btnRefresh.onclick = function() {
        if (activeChannel) {
          playChannel(activeChannel);
          showToast('Reloading channel...');
        }
      };
    }

    if (countryDropdown) {
      countryDropdown.onchange = function() {
        var val = countryDropdown.value;
        loadSelectedCountry(val);
      };
    }

    if (searchInput) {
      searchInput.onkeyup = function() {
        applyFilterAndRender();
      };
    }

    if (categoryTabs) {
      categoryTabs.onclick = function(e) {
        var t = e.target;
        if (t && t.getAttribute('data-cat')) {
          var tabs = categoryTabs.querySelectorAll('.cat-tab');
          for (var i = 0; i < tabs.length; i++) {
            tabs[i].className = 'cat-tab';
          }
          t.className = 'cat-tab active';
          currentCategory = t.getAttribute('data-cat');
          applyFilterAndRender();
        }
      };
    }

    if (btnLoadM3u) {
      btnLoadM3u.onclick = function() {
        if (modalM3u) modalM3u.className = 'modal-overlay open';
      };
    }
    if (btnCancelModal) {
      btnCancelModal.onclick = function() {
        if (modalM3u) modalM3u.className = 'modal-overlay';
      };
    }
    if (btnSubmitM3u) {
      btnSubmitM3u.onclick = function() {
        var url = m3uUrlInput.value.replace(/^\s+|\s+$/g, '');
        if (!url) return;
        if (modalM3u) modalM3u.className = 'modal-overlay';
        fetchM3U(url, 'Custom M3U', function(err, items) {
          if (!err && items && items.length > 0) {
            channels = items;
            if (playlistNameDisplay) playlistNameDisplay.innerHTML = 'Custom M3U';
            playChannel(channels[0]);
            applyFilterAndRender();
            showToast('Loaded ' + items.length + ' channels!');
          } else {
            showToast('Failed to load M3U url.');
          }
        });
      };
    }
  }

  function showToast(txt) {
    if (!toastMsg) return;
    toastMsg.innerHTML = txt;
    toastMsg.className = 'toast show';
    setTimeout(function() {
      toastMsg.className = 'toast';
    }, 2800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();