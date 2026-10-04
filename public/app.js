'use strict';

const grid = document.querySelector('#photo-grid');
const dialog = document.querySelector('#lightbox');
const closeButton = document.querySelector('#close-lightbox');
const largeImage = document.querySelector('#lightbox-image');
let photos = [];
let activeIndex = -1;
let returnHash = '';
let ownsPhotoHistory = false;

function displayPhoto(index) {
  const photo = photos[index];
  if (!photo) return;
  activeIndex = index;
  document.querySelector('#lightbox-id').textContent = photo.id;
  largeImage.src = photo.src;
  largeImage.alt = `照片 ${photo.id}`;
  const url = new URL(location.href);
  url.hash = `photo-${photo.id}`;
  history.replaceState(history.state, '', url);
}

function openPhoto(id) {
  const index = photos.findIndex((photo) => photo.id === id);
  if (index < 0) return;
  if (!dialog.open) {
    returnHash = /^#photo-/.test(location.hash) ? '' : location.hash;
    ownsPhotoHistory = !/^#photo-/.test(location.hash);
    if (ownsPhotoHistory) {
      const url = new URL(location.href);
      url.hash = `photo-${id}`;
      history.pushState(null, '', url);
    }
    dialog.showModal();
    document.body.classList.add('modal-open');
    closeButton.focus({ preventScroll: true });
  }
  displayPhoto(index);
}

function handleHash() {
  const match = location.hash.match(/^#photo-(\d+)$/);
  if (match) {
    openPhoto(match[1].padStart(3, '0'));
  } else if (dialog.open) {
    ownsPhotoHistory = false;
    returnHash = location.hash;
    dialog.close();
  }
}

async function loadPhotos() {
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
    const fragment = document.createDocumentFragment();
    photos.forEach((photo, index) => {
      const figure = document.createElement('figure');
      figure.className = 'photo-card';
      const button = document.createElement('button');
      button.className = 'photo-open';
      button.dataset.photo = photo.id;
      button.setAttribute('aria-label', `查看照片 ${photo.id}`);
      const image = document.createElement('img');
      image.src = photo.thumb;
      image.alt = `照片 ${photo.id}`;
      image.width = photo.width;
      image.height = photo.height;
      image.loading = index < 4 ? 'eager' : 'lazy';
      image.decoding = 'async';
      const caption = document.createElement('figcaption');
      caption.className = 'photo-id';
      caption.textContent = photo.id;
      button.append(image);
      figure.append(button, caption);
      fragment.append(figure);
    });
    grid.replaceChildren(fragment);
    handleHash();
  } catch (error) {
    document.querySelector('#error-state').hidden = false;
    console.error(error);
  } finally {
    grid.setAttribute('aria-busy', 'false');
  }
}

grid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-photo]');
  if (button) openPhoto(button.dataset.photo);
});
closeButton.addEventListener('click', () => dialog.close());
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
});
document.addEventListener('keydown', (event) => {
  if (dialog.open && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
    displayPhoto(activeIndex + (event.key === 'ArrowLeft' ? -1 : 1));
  }
});
window.addEventListener('hashchange', handleHash);
window.addEventListener('popstate', handleHash);
loadPhotos();
