'use strict';

const $ = (selector) => document.querySelector(selector);
const grid = $('#photo-grid');
const dialog = $('#lightbox');
const favoriteKey = 'everyday-archive:photo-gallery:favorites:v1';
let photos = [];
let filtered = [];
let sequence = [];
let activeId = null;
let favoritesOnly = false;
let returnHash = '';
let ownsPhotoHistory = false;
let toastTimer;
let favorites = new Set();

try {
  const saved = JSON.parse(localStorage.getItem(favoriteKey) || '[]');
  if (Array.isArray(saved)) favorites = new Set(saved.filter((id) => typeof id === 'string'));
} catch { /* 隐私模式或存储不可用时，仍支持本次浏览中的收藏。 */ }

const heart = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';

function notify(message) {
  const toast = $('#toast');
  (dialog.open ? dialog : document.body).append(toast);
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
}

function updateFavoriteButtons() {
  document.querySelectorAll('[data-favorite]').forEach((button) => {
    const selected = favorites.has(button.dataset.favorite);
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-label', `${selected ? '取消收藏' : '收藏'}照片 ${button.dataset.favorite}`);
  });
  $('#favorite-count').textContent = photos.filter((photo) => favorites.has(photo.id)).length;
  $('#favorite-photo').setAttribute('aria-pressed', String(favorites.has(activeId)));
  $('#favorite-photo').textContent = favorites.has(activeId) ? '♥ 已收藏' : '♡ 收藏';
}

function toggleFavorite(id) {
  if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
  try { localStorage.setItem(favoriteKey, JSON.stringify([...favorites])); }
  catch { notify('收藏仅在本次浏览中保存'); }
  if (favoritesOnly) render(); else updateFavoriteButtons();
}

function render() {
  const query = $('#search').value.trim().replace(/^#/, '');
  const normalized = /^\d+$/.test(query) ? String(Number(query)).padStart(3, '0') : query;
  filtered = photos.filter((photo) => (!favoritesOnly || favorites.has(photo.id)) && (!query || photo.id === normalized));
  if ($('#sort').value === 'desc') filtered.reverse();
  const fragment = document.createDocumentFragment();
  filtered.forEach((photo, index) => {
    const article = document.createElement('article');
    article.className = 'photo-card';
    const open = document.createElement('button');
    open.className = 'photo-open';
    open.dataset.photo = photo.id;
    open.setAttribute('aria-label', `查看照片 ${photo.id}`);
    const img = document.createElement('img');
    img.src = photo.thumb;
    img.alt = `照片 ${photo.id}`;
    img.width = photo.width;
    img.height = photo.height;
    img.loading = index < 4 ? 'eager' : 'lazy';
    img.decoding = 'async';
    open.append(img);
    const caption = document.createElement('div');
    caption.className = 'photo-caption';
    const label = document.createElement('span');
    label.className = 'photo-label';
    const number = document.createElement('span');
    number.className = 'photo-id';
    number.textContent = photo.id;
    const small = document.createElement('small');
    small.textContent = 'PHOTO';
    label.append(number, small);
    const favorite = document.createElement('button');
    favorite.className = 'favorite';
    favorite.dataset.favorite = photo.id;
    favorite.innerHTML = heart;
    caption.append(label, favorite);
    article.append(open, caption);
    fragment.append(article);
  });
  grid.replaceChildren(fragment);
  grid.setAttribute('aria-busy', 'false');
  $('#results-count').textContent = `显示 ${String(filtered.length).padStart(2, '0')} / ${String(photos.length).padStart(2, '0')} 张照片`;
  $('#empty-state').hidden = filtered.length > 0;
  $('#empty-title').textContent = favoritesOnly && !query ? '把喜欢的瞬间留在这里' : '没有找到这张照片';
  $('#empty-description').textContent = favoritesOnly && !query ? '点击照片旁的爱心即可收藏，收藏保存在当前浏览器。' : '试试其他编号，或查看全部照片。';
  $('#filter-all').classList.toggle('active', !favoritesOnly);
  $('#filter-favorites').classList.toggle('active', favoritesOnly);
  $('#filter-all').setAttribute('aria-pressed', String(!favoritesOnly));
  $('#filter-favorites').setAttribute('aria-pressed', String(favoritesOnly));
  updateFavoriteButtons();
}

function displayPhoto(id) {
  const photo = photos.find((item) => item.id === id);
  if (!photo) return;
  activeId = id;
  const index = sequence.indexOf(id);
  $('#lightbox-id').textContent = id;
  $('#lightbox-position').textContent = `${String(index + 1).padStart(2, '0')} / ${String(sequence.length).padStart(2, '0')}`;
  const img = $('#lightbox-image');
  $('#image-error').hidden = true;
  img.hidden = false;
  img.alt = `照片 ${id}，完整画面`;
  img.src = photo.src;
  $('#download-photo').href = photo.src;
  $('#download-photo').download = `photo-${id}.webp`;
  $('#prev-photo').disabled = index <= 0;
  $('#next-photo').disabled = index >= sequence.length - 1;
  updateFavoriteButtons();
  const url = new URL(location.href);
  url.hash = `photo-${id}`;
  history.replaceState(history.state, '', url);
}

function openPhoto(id, ids = photos.map((photo) => photo.id)) {
  if (!photos.some((photo) => photo.id === id)) return;
  sequence = ids.includes(id) ? [...ids] : photos.map((photo) => photo.id);
  if (!dialog.open) {
    returnHash = /^#photo-/.test(location.hash) ? '#archive' : location.hash;
    ownsPhotoHistory = !/^#photo-/.test(location.hash);
    if (ownsPhotoHistory) {
      const url = new URL(location.href);
      url.hash = `photo-${id}`;
      history.pushState(null, '', url);
    }
    dialog.showModal();
    document.body.classList.add('modal-open');
    $('#close-lightbox').focus();
  }
  displayPhoto(id);
}

function stepPhoto(direction) {
  const target = sequence[sequence.indexOf(activeId) + direction];
  if (target) displayPhoto(target);
}

function handleHash() {
  const match = location.hash.match(/^#photo-(\d+)$/);
  if (match) {
    const id = match[1].padStart(3, '0');
    if (photos.some((photo) => photo.id === id)) openPhoto(id);
    else notify('这个编号的照片暂不在相册中');
  } else if (dialog.open) {
    ownsPhotoHistory = false;
    returnHash = location.hash;
    dialog.close();
  }
}

async function loadPhotos() {
  $('#error-state').hidden = true;
  grid.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('./photos.json');
    if (!response.ok) throw new Error('照片清单加载失败');
    const data = await response.json();
    if (!Array.isArray(data.photos)) throw new Error('照片清单格式错误');
    const ids = new Set();
    photos = data.photos.filter((photo) => {
      const valid = typeof photo.id === 'string' && /^\d{3,}$/.test(photo.id) &&
        !ids.has(photo.id) && /^photos\/[\w.-]+\.webp$/.test(photo.src) &&
        /^photos\/[\w.-]+\.webp$/.test(photo.thumb);
      if (valid) ids.add(photo.id);
      return valid;
    }).sort((a, b) => Number(a.id) - Number(b.id));
    $('#total-count').textContent = photos.length;
    $('#first-id').textContent = photos[0]?.id || '—';
    $('#last-id').textContent = photos.at(-1)?.id || '—';
    document.querySelectorAll('[data-total]').forEach((element) => {
      element.textContent = String(photos.length).padStart(3, '0');
    });
    // 封面照片下架后自动选用相册中仍存在的照片。
    document.querySelectorAll('.hero-art [data-photo]').forEach((button, index) => {
      const photo = photos.find((item) => item.id === button.dataset.photo) || photos[index] || photos[0];
      button.hidden = !photo;
      if (!photo) return;
      button.dataset.photo = photo.id;
      button.setAttribute('aria-label', `查看照片 ${photo.id}`);
      button.querySelector('img').src = index === 0 ? photo.src : photo.thumb;
      button.querySelector('img').alt = `相册照片 ${photo.id}`;
      button.querySelector('.mono').replaceChildren(document.createTextNode(`NO. ${photo.id}`));
    });
    render();
    handleHash();
  } catch (error) {
    grid.setAttribute('aria-busy', 'false');
    $('#results-count').textContent = '加载未完成';
    $('#error-state').hidden = false;
    console.error(error);
  }
}

document.addEventListener('click', (event) => {
  const favorite = event.target.closest('[data-favorite]');
  if (favorite) { toggleFavorite(favorite.dataset.favorite); return; }
  const button = event.target.closest('[data-photo]');
  if (button) openPhoto(button.dataset.photo, button.closest('#photo-grid') ? filtered.map((photo) => photo.id) : undefined);
});
$('#filter-all').addEventListener('click', () => { favoritesOnly = false; render(); });
$('#filter-favorites').addEventListener('click', () => { favoritesOnly = true; render(); });
$('#search').addEventListener('input', render);
$('#sort').addEventListener('change', render);
$('#reset-filters').addEventListener('click', () => { favoritesOnly = false; $('#search').value = ''; render(); });
$('#retry').addEventListener('click', loadPhotos);
$('#close-lightbox').addEventListener('click', () => dialog.close());
$('#prev-photo').addEventListener('click', () => stepPhoto(-1));
$('#next-photo').addEventListener('click', () => stepPhoto(1));
$('#favorite-photo').addEventListener('click', () => toggleFavorite(activeId));
$('#lightbox-image').addEventListener('error', () => { $('#lightbox-image').hidden = true; $('#image-error').hidden = false; });
dialog.addEventListener('close', () => {
  document.body.classList.remove('modal-open');
  if (ownsPhotoHistory) {
    ownsPhotoHistory = false;
    history.back();
  } else {
    const url = new URL(location.href);
    url.hash = returnHash;
    history.replaceState(null, '', url);
  }
  $('#toast').hidden = true;
  document.body.append($('#toast'));
});
document.addEventListener('keydown', (event) => {
  if (event.target.matches('input,textarea,select')) return;
  if (dialog.open && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
    stepPhoto(event.key === 'ArrowLeft' ? -1 : 1);
  } else if (!dialog.open && event.key === '/') {
    event.preventDefault();
    $('#search').focus();
  }
});
window.addEventListener('hashchange', handleHash);
window.addEventListener('popstate', handleHash);
window.addEventListener('storage', (event) => {
  if (event.key !== favoriteKey) return;
  try {
    const saved = JSON.parse(event.newValue || '[]');
    favorites = new Set(Array.isArray(saved) ? saved : []);
    render();
  } catch { /* 忽略其他标签页中的异常存储数据。 */ }
});
$('#copy-link').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    notify('已复制这张照片的链接');
  } catch {
    const field = document.createElement('textarea');
    field.value = location.href;
    field.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    dialog.append(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    $('#copy-link').focus();
    notify(copied ? '已复制这张照片的链接' : '请复制地址栏中的链接');
  }
});
loadPhotos();
