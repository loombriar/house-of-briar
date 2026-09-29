const year = document.getElementById('year');
if (year) {
  year.textContent = new Date().getFullYear();
}

const filterButtons = document.querySelectorAll('.filter-button');
const productCards = document.querySelectorAll('.product-card');

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const selected = button.dataset.filter;

    filterButtons.forEach((btn) => btn.classList.toggle('is-active', btn === button));

    productCards.forEach((card) => {
      const matches = selected === 'all' || card.dataset.category === selected;
      card.style.display = matches ? 'block' : 'none';
    });
  });
});

const newsletterForm = document.querySelector('.newsletter-form');
newsletterForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const emailInput = newsletterForm.querySelector('input');

  if (emailInput && emailInput.value.trim()) {
    emailInput.value = '';
    emailInput.placeholder = 'Thanks for joining!';
  }
});
