(function ($) {

  var productSearchTimer = null;

  function renderProductResults(items) {
    var $results = $('.wpa-product-results');
    if (!$results.length) return;
    if (!items || !items.length) {
      $results.prop('hidden', false).html('<button type="button" class="wpa-product-result" disabled>No products found</button>');
      return;
    }
    $results.prop('hidden', false).html(items.map(function (item) {
      return '<button type="button" class="wpa-product-result" data-id="' + item.id + '" data-text="' + $('<div>').text(item.text).html() + '">' +
        (item.image ? '<img src="' + $('<div>').text(item.image).html() + '" alt="" />' : '') +
        '<span>' + $('<div>').text(item.text).html() + '</span></button>';
    }).join(''));
  }

  function searchProducts(term) {
    clearTimeout(productSearchTimer);
    productSearchTimer = setTimeout(function () {
      if (!term || term.length < 2) {
        $('.wpa-product-results').prop('hidden', true).empty();
        return;
      }
      $.get(WPAdvertisingAdmin.ajaxUrl, {
        action: 'wp_advertising_search_products',
        nonce: WPAdvertisingAdmin.productSearchNonce,
        term: term
      }).done(function (response) {
        renderProductResults(response && response.success ? response.data.results : []);
      });
    }, 220);
  }

  function selectedTheme() {
    return $('[data-theme-picker]:checked').val() || 'dark';
  }

  function updateSourceFields() {
    var source = $('#wpa-source-type').val();
    var mode = $('#wpa-product-mode').val();
    var isWoo = source === 'woocommerce';
    $('.wpa-product-mode-field').toggle(isWoo);
    $('.wpa-product-id-field').toggle(isWoo && mode === 'specific');
    $('.wpa-refresh-random').toggle(isWoo && mode === 'random');
  }

  function updatePreviewText(field, value) {
    var $stage = $('#wpa-preview-stage');
    if (!$stage.length) return;

    if (field === 'image') {
      var $image = $stage.find('[data-preview-field="image"]');
      if (!$image.length) return;
      if ($image.is('img')) {
        if (value) $image.attr('src', value);
      } else if (value) {
        $image.replaceWith('<img data-preview-field="image" src="' + $('<div>').text(value).html() + '" alt="Ad preview" loading="lazy">');
      }
      return;
    }

    $stage.find('[data-preview-field="' + field + '"]').text(value || '');
  }

  function updatePreviewTheme(theme) {
    var $card = $('#wpa-preview-stage .wpa-card');
    if (!$card.length) return;
    $card.removeClass(function (_, className) {
      return (className.match(/(^|\s)wpa-theme-\S+/g) || []).join(' ');
    }).addClass('wpa-theme-' + theme);
  }

  function refreshRandomProduct() {
    var $button = $('.wpa-refresh-random');
    var $stage = $('#wpa-preview-stage');
    if (!$button.length || !$stage.length) return;

    $button.prop('disabled', true).text('Loading...');
    $.post(WPAdvertisingAdmin.ajaxUrl, {
      action: 'wp_advertising_preview_random',
      nonce: WPAdvertisingAdmin.nonce,
      ad_id: $stage.data('ad-id') || 0,
      label: $('[name="label"]').val(),
      headline: $('[name="headline"]').val(),
      body: $('[name="body"]').val(),
      cta: $('[name="cta"]').val(),
      image_url: $('[name="image_url"]').val(),
      theme: selectedTheme()
    }).done(function (response) {
      if (response && response.success && response.data.html) {
        $stage.html(response.data.html);
        updatePreviewTheme(selectedTheme());
      }
    }).always(function () {
      $button.prop('disabled', false).text('Show another random product');
    });
  }

  $(document).on('input', '[data-live-field]', function () {
    updatePreviewText($(this).data('live-field'), $(this).val());
  });

  $(document).on('change', '[data-theme-picker]', function () {
    updatePreviewTheme(selectedTheme());
  });

  $(document).on('change', '#wpa-source-type, #wpa-product-mode', updateSourceFields);


  $(document).on('input', '.wpa-product-search', function () {
    searchProducts($(this).val());
  });

  $(document).on('click', '.wpa-product-result:not(:disabled)', function () {
    var id = $(this).data('id');
    var text = $(this).data('text');
    $('[name="product_id"]').val(id);
    $('.wpa-product-search').val(text);
    $('.wpa-selected-product').text('Selected: ' + text);
    $('.wpa-product-results').prop('hidden', true).empty();
  });

  $(document).on('click', function (event) {
    if (!$(event.target).closest('.wpa-product-id-field').length) {
      $('.wpa-product-results').prop('hidden', true);
    }
  });

  $(document).on('click', '.wpa-refresh-random', function (event) {
    event.preventDefault();
    refreshRandomProduct();
  });

  $(document).on('click', '.wpa-copy', function () {
    var text = $(this).data('copy') || '';
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      var area = $('<textarea>').val(text).appendTo('body').select();
      document.execCommand('copy');
      area.remove();
    }
    var original = $(this).text();
    $(this).text('Copied');
    var button = this;
    setTimeout(function () { $(button).text(original); }, 1200);
  });


  function removeUnrelatedOptimizationNotice() {
    $('.notice, .updated, .error').each(function () {
      var text = ($(this).text() || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (text.indexOf('reset the optimized data successfully') !== -1) {
        $(this).remove();
      }
    });
  }

  function watchForUnrelatedOptimizationNotice() {
    if (!window.MutationObserver || !document.body) {
      return;
    }
    var observer = new MutationObserver(function () {
      removeUnrelatedOptimizationNotice();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  removeUnrelatedOptimizationNotice();

  $(function () {
    removeUnrelatedOptimizationNotice();
    watchForUnrelatedOptimizationNotice();
    updateSourceFields();
    updatePreviewTheme(selectedTheme());
  });
})(jQuery);
