(function () {
  var page = document.getElementById("book-page");
  if (!page || !window.addEventListener) return;

  var initialWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  var timer = null;
  function refreshAfterRotation() {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(function () {
      var width = window.innerWidth || document.documentElement.clientWidth || 0;
      if (Math.abs(width - initialWidth) > 80) window.location.reload();
    }, 220);
  }

  window.addEventListener("orientationchange", refreshAfterRotation, false);
  window.addEventListener("resize", refreshAfterRotation, false);
}());
