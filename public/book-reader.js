(function () {
  var page = document.getElementById("book-page");
  var sourceNode = document.getElementById("book-source");
  var next = document.getElementById("book-next");
  var previous = document.getElementById("book-prev");
  if (!page || !sourceNode) return;

  var source = sourceNode.value || "";
  var leadingMatch = source.match(/^\s*/);
  var leading = leadingMatch ? leadingMatch[0].length : 0;
  var visibleSource = source.substring(leading);
  var start = parseInt(page.getAttribute("data-start") || "0", 10);
  var pageNumber = parseInt(page.getAttribute("data-page") || "1", 10);
  var absolutePage = parseInt(page.getAttribute("data-absolute-page") || String(pageNumber), 10);
  var size = parseInt(page.getAttribute("data-size") || "64", 10);
  var chapterLength = parseInt(page.getAttribute("data-length") || "0", 10);
  var bookLength = parseInt(page.getAttribute("data-book-length") || String(chapterLength), 10);
  var bookOffset = parseInt(page.getAttribute("data-book-offset") || "0", 10);
  var totalPages = parseInt(page.getAttribute("data-total-pages") || "1", 10);
  var nextChapter = page.getAttribute("data-next-chapter") || "";
  var pageCount = document.getElementById("book-page-count");
  var progressNode = document.getElementById("book-progress");

  function putText(value) {
    if (typeof page.textContent !== "undefined") page.textContent = value;
    else page.innerText = value;
  }

  function fits(length) {
    putText(visibleSource.substring(0, length));
    return page.scrollHeight <= page.clientHeight;
  }

  /* Adaptive Pagination / Adaptive Text Fitting from the Kindle-tested
     kindle2.0 reader: binary-search the longest visible substring that fits. */
  var low = 0;
  var high = visibleSource.length;
  while (low < high) {
    var middle = Math.ceil((low + high) / 2);
    if (fits(middle)) low = middle;
    else high = middle - 1;
  }
  putText(visibleSource.substring(0, low));

  var end = Math.min(start + leading + low, chapterLength);
  if (totalPages < absolutePage) totalPages = absolutePage;
  var completed = bookLength > 0 ? ((bookOffset + end) / bookLength) * 100 : 100;
  var completedLabel = completed < 10
    ? (Math.floor(completed * 10) / 10).toFixed(1)
    : String(Math.floor(completed));
  if (pageCount) {
    if (typeof pageCount.textContent !== "undefined") pageCount.textContent = absolutePage + "页/共" + totalPages + "页";
    else pageCount.innerText = absolutePage + "页/共" + totalPages + "页";
  }
  if (progressNode) {
    if (typeof progressNode.textContent !== "undefined") progressNode.textContent = "已完成 " + completedLabel + "%";
    else progressNode.innerText = "已完成 " + completedLabel + "%";
  }

  var prefix = window.location.pathname + "?";
  var storagePrefix = "modu-reader-" + window.location.pathname + "-" + size + "-";
  var suppliedPrevious = null;
  var query = window.location.search.substring(1).split("&");
  for (var index = 0; index < query.length; index += 1) {
    var pair = query[index].split("=");
    if (pair[0] === "prev") suppliedPrevious = parseInt(pair[1], 10);
  }

  try {
    if (suppliedPrevious !== null && !isNaN(suppliedPrevious)) {
      localStorage.setItem(storagePrefix + start, String(suppliedPrevious));
    }
    var knownPrevious = suppliedPrevious;
    if (knownPrevious === null || isNaN(knownPrevious)) {
      var stored = localStorage.getItem(storagePrefix + start);
      if (stored !== null) knownPrevious = parseInt(stored, 10);
    }
    if (previous && previous.tagName.toLowerCase() === "a" && knownPrevious !== null && !isNaN(knownPrevious)) {
      var older = localStorage.getItem(storagePrefix + knownPrevious);
      previous.href = prefix + "start=" + knownPrevious + "&page=" + Math.max(pageNumber - 1, 1) + "&size=" + size;
      if (older !== null) previous.href += "&prev=" + older;
    }
  } catch (error) {
    // Local storage is an enhancement; the server-provided links remain usable.
  }

  if (next && next.tagName.toLowerCase() === "a") {
    if (end >= chapterLength) {
      if (nextChapter) next.href = nextChapter;
      else {
        var finalControl = document.createElement("span");
        finalControl.className = "disabled-control";
        finalControl.id = "book-next";
        finalControl.appendChild(document.createTextNode("末页"));
        next.parentNode.replaceChild(finalControl, next);
      }
    } else {
      next.href = prefix + "start=" + end + "&prev=" + start + "&page=" + (pageNumber + 1) + "&size=" + size;
    }
  }
}());
