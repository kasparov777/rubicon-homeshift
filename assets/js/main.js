/* ============================================================
   MAIN.JS — общее поведение сайта (бургер, год, форма)
   Многоязычное: сообщение формы зависит от lang у <html>
   ============================================================ */
(function () {
  'use strict';

  var lang = (document.documentElement.getAttribute('lang') || 'ru').toLowerCase();
  var dict = {
    ru: 'Спасибо! Это демо-сайт — в рабочей версии здесь будет отправка заявки на мессенджер. А пока напишите нам в Telegram/WhatsApp.',
    pl: 'Dziękujemy! To wersja demonstracyjna — w wersji roboczej tutaj będzie wysyłka zgłoszenia do komunikatora. Na razie napisz do nas na Telegram/WhatsApp.',
    en: 'Thank you! This is a demo site — in the working version the form will send your request to a messenger. For now, message us on Telegram/WhatsApp.'
  };

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
      msg.textContent = dict[lang] || dict.ru;
      msg.style.color = '#6E9444';
    });
  }
})();