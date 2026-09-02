/* ============================================================
   MAIN.JS — общий поведение сайта (бургер, год, форма)
   ============================================================ */
(function () {
  'use strict';

  /* --- Мобильное меню (бургер) --- */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.main-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      nav.classList.toggle('open');
    });
  }

  /* --- Автогод в футере --- */
  var yearEl = document.querySelector('[data-year]');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* --- Форма контакта (без бэкенда: заглушка + подсказка) --- */
  var form = document.getElementById('contact-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = document.getElementById('form-status');
      if (!msg) return;
      msg.textContent = 'Спасибо! Это демо-сайт — в рабочей версии здесь будет отправка заявки на мессенджер. А пока напишите нам в Telegram/WhatsApp.';
      msg.style.color = '#6E9444';
    });
  }
})();