'use client';import LocaleElement from "@/components/locale/LocaleElement";

import Link from "@/components/locale/LocaleLink";
import { useRef, useState } from 'react';
import { products } from '@/lib/catalog/data';
import { useSelection } from '@/components/catalog/SelectionProvider';
import { saveInquiry } from '@/lib/workspace/store';
import { SALES_EMAIL, SALES_PHONE, INQUIRY_INTENTS, FIELD_LIMITS, normalizeInquiry, validateInquiry, inquiryItems, documentNames, inquirySubject, buildInquiryText, buildEmailDraft } from '@/lib/inquiry/model';

function Field({ name, label, values, errors, onChange, wide, multiline, ...props }) {
  const id = `inquiry-${name}`;
  const inputProps = { id, name, value: values[name], onChange: (event) => onChange(name, event.target.value), maxLength: FIELD_LIMITS[name], 'aria-invalid': Boolean(errors[name]), 'aria-describedby': errors[name] ? `${id}-error` : undefined, ...props };
  return <LocaleElement as="label" className={`inquiry-field${wide ? ' wide' : ''}`} htmlFor={id}><LocaleElement as="span">{label}</LocaleElement>{multiline ? <LocaleElement as="textarea" {...inputProps} /> : <LocaleElement as="input" {...inputProps} />}{errors[name] && <LocaleElement as="span" id={`${id}-error`} className="inquiry-error">{errors[name]}</LocaleElement>}</LocaleElement>;
}

function Quantity({ item, onChange }) {
  const [draft, setDraft] = useState(String(item.quantity));
  function commit() {
    const quantity = Math.min(999, Math.max(1, Math.floor(Number(draft)) || 1));
    setDraft(String(quantity));
    onChange(quantity);
  }
  return <LocaleElement as="label" className="inquiry-quantity"><LocaleElement as="span">Кол-во, шт.</LocaleElement><LocaleElement as="input" aria-label={`Количество ${item.sku}`} type="number" min="1" max="999" step="1" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} /></LocaleElement>;
}

export default function InquiryForm({ initial }) {
  const selection = useSelection();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [documents, setDocuments] = useState([]);
  const [prepared, setPrepared] = useState(false);
  const [status, setStatus] = useState('');
  const [savedId, setSavedId] = useState('');
  const formRef = useRef(null);
  const previewRef = useRef(null);
  const textRef = useRef(null);
  const investment=values.intent==='investment';
  const items = investment ? [] : inquiryItems(selection.items, products);
  const text = buildInquiryText(values, items, documents);
  const emailDraft = buildEmailDraft(values, text);
  const hasDemo = items.some((item) => item.source === 'demo');

  function invalidate() {setPrepared(false);setStatus('');}
  function change(name, value) {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
    invalidate();
  }
  function validate() {
    const nextErrors = validateInquiry(values);
    setErrors(nextErrors);
    if (!Object.keys(nextErrors).length) return true;
    setPrepared(false);
    setStatus('Проверьте отмеченные поля. Заявка не отправлялась.');
    formRef.current?.querySelector(`[name="${Object.keys(nextErrors)[0]}"]`)?.focus();
    return false;
  }
  function prepare(event) {
    event.preventDefault();
    if (!validate()) return;
    setPrepared(true);
    setStatus('Текст готов к проверке. Выберите, как его сохранить или использовать. Ничего не отправлено.');
    window.setTimeout(() => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }
  async function copy() {
    if (!validate()) return;
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Текст скопирован. Вставьте его в письмо и отправьте самостоятельно.');
    } catch {
      textRef.current?.focus();
      textRef.current?.select();
      setStatus('Автоматическое копирование недоступно. Текст выделен: скопируйте его вручную.');
    }
  }
  function download() {
    if (!validate()) return;
    const url = URL.createObjectURL(new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;anchor.download = 'alageum-project-inquiry.txt';
    document.body.appendChild(anchor);anchor.click();anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('Файл TXT подготовлен к скачиванию. Заявка не отправлена.');
  }
  function saveLocal() {
    if (!validate()) return;
    try {
      const draft = normalizeInquiry(values);
      const id = saveInquiry({ id: savedId || undefined, subject: inquirySubject(draft), text, contactName: draft.contactName, company: draft.company, email: draft.email, phone: draft.phone, documents, items, status: 'draft' });
      setSavedId(id);
      setStatus('Черновик сохранён только в этом браузере. Откройте демо-кабинет, чтобы проверить сценарий рассмотрения.');
    } catch {
      setStatus('Не удалось сохранить черновик в браузере. Скачайте TXT или скопируйте текст, чтобы не потерять его.');
    }
  }
  const field = { values, errors, onChange: change };

  return <LocaleElement as="div" className="catalog-page inquiry-page">
    <LocaleElement as="nav" className="breadcrumbs" aria-label="Хлебные крошки"><Link href="/">Главная</Link><LocaleElement as="span">/</LocaleElement><LocaleElement as="span">Запрос по проекту</LocaleElement></LocaleElement>
    <LocaleElement as="div" className="catalog-heading"><LocaleElement as="div"><LocaleElement as="p" className="catalog-kicker">ОТ ЗАДАЧИ К ОБОРУДОВАНИЮ</LocaleElement><LocaleElement as="h1">Обсудим ваш проект</LocaleElement></LocaleElement><LocaleElement as="p">{investment?'Опишите инвестиционный проект и предложение о сотрудничестве.':'Соберите исходные данные и состав оборудования.'}<br />{investment?'Подготовьте запрос для ответственного за инвестиционное сотрудничество.':'Подготовьте понятный запрос для отдела продаж.'}</LocaleElement></LocaleElement>
    <LocaleElement as="div" className="inquiry-note"><LocaleElement as="span" className="notice-mark" aria-hidden="true">i</LocaleElement><LocaleElement as="div"><LocaleElement as="strong">Сначала подготовка, затем отправка вами.</LocaleElement> Эта форма формирует текст в браузере и не отправляет данные на сервер. Можно скачать запрос, скопировать его или открыть письмо в вашей почтовой программе. Контакты не сохраняются, пока вы сами не сохраните локальный черновик.</LocaleElement></LocaleElement>
    <LocaleElement as="div" className="inquiry-layout">
      <LocaleElement as="div">
        <LocaleElement as="form" className="inquiry-form" ref={formRef} onSubmit={prepare} noValidate>
          {Object.values(errors).some(Boolean) && <LocaleElement as="div" className="inquiry-error-summary" role="alert">Проверьте поля, отмеченные красным. Нужны описание задачи, имя и хотя бы один контакт для ответа.</LocaleElement>}
          <LocaleElement as="fieldset" className="inquiry-section"><LocaleElement as="legend"><LocaleElement as="span">01</LocaleElement>Задача и объект</LocaleElement><LocaleElement as="p">Даже если спецификация ещё не готова, расскажите, что нужно вашему проекту. Обязательные поля отмечены *.</LocaleElement>
            <LocaleElement as="div" className="inquiry-fields">
              <LocaleElement as="label" className="inquiry-field" htmlFor="inquiry-intent"><LocaleElement as="span">Цель обращения</LocaleElement><LocaleElement as="select" id="inquiry-intent" name="intent" value={values.intent} onChange={(event) => change('intent', event.target.value)}>{INQUIRY_INTENTS.map((intent) => <LocaleElement as="option" value={intent.value} key={intent.value}>{intent.label}</LocaleElement>)}</LocaleElement></LocaleElement>
              <Field {...field} name="project" label="Название проекта" placeholder="Например, подстанция для нового цеха" />
              <Field {...field} name="location" label="Место поставки / объекта" placeholder="Город, регион или страна" />
              <Field {...field} name="deadline" label="Планируемый срок" placeholder="Например, II квартал 2027 года" />
              {values.solution && <Field {...field} name="solution" label="Направление проекта" wide />}
              <Field {...field} name="description" label="Что требуется решить? *" placeholder="Назначение объекта, требуемая мощность и напряжение, условия эксплуатации, стадия проекта. Если параметры пока неизвестны, опишите задачу." multiline wide required />
            </LocaleElement>
          </LocaleElement>
          {!investment&&<LocaleElement as="fieldset" className="inquiry-section"><LocaleElement as="legend"><LocaleElement as="span">02</LocaleElement>Состав оборудования</LocaleElement><LocaleElement as="p">Добавьте позиции из каталога или оставьте подбор специалисту. Количество можно менять здесь.</LocaleElement>
            {items.length ? <LocaleElement as="div" className="inquiry-equipment">{items.map((item) => <LocaleElement as="div" className="inquiry-item" key={item.id}><LocaleElement as="div"><LocaleElement as="strong">{item.name}</LocaleElement><LocaleElement as="small">{item.sku} · {item.source === 'demo' ? 'Синтетический пример, не реальный товар' : item.source === 'official' ? 'Публичная серия; исполнение уточняется' : 'Позиция каталога'}</LocaleElement></LocaleElement><Quantity key={`${item.id}-${item.quantity}`} item={item} onChange={(quantity) => {if (quantity !== item.quantity) {selection.setQuantity(item.id, quantity);invalidate();}}} /><LocaleElement as="button" className="remove-item" type="button" aria-label={`Удалить ${item.sku}`} onClick={() => {selection.remove(item.id);invalidate();}}>×</LocaleElement></LocaleElement>)}</LocaleElement> : <LocaleElement as="div" className="inquiry-empty"><LocaleElement as="p">Оборудование не выбрано. Это не мешает подготовить запрос: опишите задачу, и в письме появится просьба помочь с подбором.</LocaleElement><Link className="catalog-button compact" href="/catalog" target="_blank" rel="noreferrer">Выбрать в каталоге ↗</Link><LocaleElement as="span" className="inquiry-help"> Каталог откроется в новой вкладке; форма останется здесь.</LocaleElement></LocaleElement>}
            {items.length > 0 && <Link className="catalog-button compact" href="/catalog" target="_blank" rel="noreferrer">Дополнить подборку в новой вкладке ↗</Link>}
            {hasDemo && <LocaleElement as="p" className="inquiry-error">В подборке есть синтетические тестовые позиции. В тексте запроса они будут отдельно отмечены; использовать их характеристики для проектирования нельзя.</LocaleElement>}
            {selection.storageUnavailable && <LocaleElement as="p" className="inquiry-help">Хранилище браузера недоступно. Подборка может исчезнуть после закрытия страницы.</LocaleElement>}
          </LocaleElement>
          }<LocaleElement as="fieldset" className="inquiry-section"><LocaleElement as="legend"><LocaleElement as="span">03</LocaleElement>Документы к обсуждению</LocaleElement><LocaleElement as="p">Для запроса коммерческого предложения нужны документы компании. Точный перечень, этап передачи и порядок проверки уточняются с менеджером. Здесь можно отметить названия планируемых документов: техническое задание, спецификацию или карточку компании. Файлы не читаются и не загружаются. Не вводите банковские данные в описание проекта.</LocaleElement>
            <LocaleElement as="label" className="inquiry-field" htmlFor="inquiry-documents"><LocaleElement as="span">Выбрать файлы, чтобы добавить только их названия</LocaleElement><LocaleElement as="input" className="inquiry-file-input" id="inquiry-documents" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg" onChange={(event) => {const names = documentNames(event.target.files);setDocuments((current) => documentNames([...current, ...names]));event.target.value = '';invalidate();}} /><LocaleElement as="span" className="inquiry-help">До 10 названий. При отправке письма вложения нужно добавить самостоятельно. Для банковских реквизитов и платёжных документов согласуйте канал передачи с менеджером.</LocaleElement></LocaleElement>
            {documents.length > 0 && <LocaleElement as="ul" className="inquiry-documents" aria-label="Названия планируемых документов">{documents.map((name) => <LocaleElement as="li" key={name}><LocaleElement as="span">{name}</LocaleElement><LocaleElement as="button" type="button" aria-label={`Убрать ${name}`} onClick={() => {setDocuments((current) => current.filter((item) => item !== name));invalidate();}}>×</LocaleElement></LocaleElement>)}</LocaleElement>}
          </LocaleElement>
          <LocaleElement as="fieldset" className="inquiry-section"><LocaleElement as="legend"><LocaleElement as="span">04</LocaleElement>Контакт для ответа</LocaleElement><LocaleElement as="p">Укажите имя и email или телефон. Введённые контакты появятся в тексте, который вы сможете проверить перед использованием.</LocaleElement>
            <LocaleElement as="div" className="inquiry-fields"><Field {...field} name="contactName" label="Ваше имя *" autoComplete="name" required /><Field {...field} name="company" label="Компания" autoComplete="organization" /><Field {...field} name="email" label="Email" type="email" autoComplete="email" inputMode="email" placeholder="name@company.kz" /><Field {...field} name="phone" label="Телефон" type="tel" autoComplete="tel" inputMode="tel" placeholder="+7 …" /></LocaleElement>
          </LocaleElement>
          <LocaleElement as="div" className="inquiry-submit"><LocaleElement as="button" type="submit" className="catalog-button primary">Подготовить текст запроса <LocaleElement as="span" aria-hidden="true">→</LocaleElement></LocaleElement><LocaleElement as="p">Следующий шаг — проверка текста.<br />Эта кнопка ничего не отправляет.</LocaleElement></LocaleElement>
        </LocaleElement>
        {prepared && <LocaleElement as="section" ref={previewRef} className="inquiry-preview" aria-labelledby="inquiry-preview-heading"><LocaleElement as="p" className="catalog-kicker">ПРОВЕРЬТЕ ПЕРЕД ИСПОЛЬЗОВАНИЕМ</LocaleElement><LocaleElement as="h2" id="inquiry-preview-heading">Ваш запрос готов</LocaleElement><LocaleElement as="p">Проверьте состав и контакты. Чтобы изменить текст, поправьте поля выше и подготовьте его заново.</LocaleElement><LocaleElement as="label" className="inquiry-field" htmlFor="inquiry-preview-text"><LocaleElement as="span">Текст запроса</LocaleElement><LocaleElement as="textarea" id="inquiry-preview-text" readOnly ref={textRef} value={text} /></LocaleElement><LocaleElement as="div" className="inquiry-actions"><LocaleElement as="button" type="button" className="catalog-button primary" onClick={copy}>Скопировать текст</LocaleElement><LocaleElement as="button" type="button" className="catalog-button" onClick={download}>Скачать TXT ↓</LocaleElement><LocaleElement as="a" className="catalog-button" href={emailDraft.href} onClick={(event) => {if (!validate()) event.preventDefault();else setStatus('Почтовая программа может открыться. Проверьте письмо, добавьте вложения и отправьте его самостоятельно. Сайт не отслеживает отправку.');}}>Открыть почтовую программу ↗</LocaleElement></LocaleElement><LocaleElement as="p" className="inquiry-mail-note">Получатель: <LocaleElement as="strong">{SALES_EMAIL}</LocaleElement>. {emailDraft.includesBody ? 'В почтовую программу передаётся текст запроса с указанными контактами.' : 'Запрос слишком большой для надёжной передачи через ссылку. Откроется только тема письма: скопируйте и вставьте текст самостоятельно.'} Файлы не прикрепляются автоматически. Если программа не открылась, создайте письмо вручную. Открытие программы не означает отправку.</LocaleElement><LocaleElement as="div" className="inquiry-local-save"><LocaleElement as="p"><LocaleElement as="strong">Посмотреть путь заявки в демо-кабинете?</LocaleElement><br />Сохраните черновик с контактами и названиями документов только в этом браузере. Его увидит любой, кто пользуется этим профилем браузера; удалить его можно в демо-кабинете. Для проверки используйте тестовые данные.</LocaleElement><LocaleElement as="button" className="catalog-button" type="button" onClick={saveLocal}>{savedId ? 'Обновить локальный черновик' : 'Сохранить локальный черновик'}</LocaleElement>{savedId && <LocaleElement as="p"><Link href={`/workspace?request=${encodeURIComponent(savedId)}`}>Открыть черновик в демо-кабинете →</Link></LocaleElement>}</LocaleElement></LocaleElement>}
        <LocaleElement as="p" className="inquiry-status" role="status" aria-live="polite">{status}</LocaleElement>
      </LocaleElement>
      <LocaleElement as="aside" className="inquiry-sidebar"><LocaleElement as="p" className="catalog-kicker">ПРОСТОЙ СЛЕДУЮЩИЙ ШАГ</LocaleElement><LocaleElement as="h2">От описания задачи<br />к предметному разговору</LocaleElement><LocaleElement as="ol" className="inquiry-steps"><LocaleElement as="li">Опишите объект, сроки и технические требования</LocaleElement><LocaleElement as="li">Проверьте оборудование и контактные данные</LocaleElement><LocaleElement as="li">Сохраните текст или откройте письмо и отправьте его сами</LocaleElement></LocaleElement><LocaleElement as="div" className="inquiry-sales"><LocaleElement as="p">Публичные контакты отдела продаж</LocaleElement><LocaleElement as="a" href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</LocaleElement><LocaleElement as="a" href="tel:+77710052222">{SALES_PHONE}</LocaleElement><LocaleElement as="a" href="https://alageum.com/ru/" target="_blank" rel="noreferrer">Источник контактов: официальный сайт ↗</LocaleElement></LocaleElement></LocaleElement>
    </LocaleElement>
  </LocaleElement>;
}
