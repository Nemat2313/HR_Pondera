'use client';

import React, { useState, useEffect } from 'react';
import {
  UserPlus,
  ShieldCheck,
  MapPin,
  Briefcase,
  KeyRound,
  Trash2,
  CheckCircle2,
  AlertCircle,
  LogIn,
  Users,
  X,
  Search,
} from 'lucide-react';
import { User, FilterOptions } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';

export default function UserManagementView() {
  const { user: currentUser, switchUser } = useAuth();
  const { lang, t, translateVal } = useLanguage();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // Filter options for dropdowns
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    regions: [],
    projects: [],
    departments: [],
    categories: [],
    nationalities: [],
    statuses: [],
  });

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'user' as 'admin' | 'user',
    scope_type: 'region' as 'all' | 'region' | 'project',
    scope_value: 'Kazan',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Fetch users & options
  const fetchUsers = () => {
    setLoading(true);
    fetch('/api/users')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setUsers(data.users || []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
    fetch('/api/filters')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setFilterOptions({
            regions: data.regions || [],
            projects: data.projects || [],
            departments: data.departments || [],
            categories: data.categories || [],
            nationalities: data.nationalities || [],
            statuses: data.statuses || [],
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    setSubmitting(true);

    try {
      const payload = {
        ...formData,
        scope_value: formData.scope_type === 'all' ? 'all' : formData.scope_value,
      };

      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setFormSuccess(
          lang === 'ru'
            ? 'Пользователь и права RLS успешно сохранены!'
            : 'Kullanıcı ve RLS yetkisi başarıyla tanımlandı!'
        );
        setTimeout(() => {
          setShowAddModal(false);
          setFormData({
            name: '',
            email: '',
            password: '',
            role: 'user',
            scope_type: 'region',
            scope_value: 'Kazan',
          });
          fetchUsers();
        }, 1200);
      } else {
        setFormError(data.message || (lang === 'ru' ? 'Не удалось добавить пользователя.' : 'Kullanıcı eklenemedi.'));
      }
    } catch {
      setFormError(lang === 'ru' ? 'Ошибка соединения при выполнении операции.' : 'İşlem sırasında bağlantı hatası oluştu.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (id: number) => {
    const confirmMsg =
      lang === 'ru'
        ? 'Вы уверены, что хотите удалить этого пользователя и его права доступа?'
        : 'Bu kullanıcıyı ve yetkilerini silmek istediğinize emin misiniz?';
    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/users?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchUsers();
      } else {
        alert(data.message || (lang === 'ru' ? 'Не удалось удалить пользователя.' : 'Kullanıcı silinemedi.'));
      }
    } catch {}
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              {lang === 'ru' ? 'Управление пользователями и RLS' : 'Kullanıcı & RLS (Row-Level Security) Yönetimi'}
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 rounded-full border border-indigo-100 dark:border-indigo-800">
              {lang === 'ru' ? 'Панель администратора' : 'Yönetici Paneli'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            {lang === 'ru'
              ? 'Создание учетных записей и настройка прав доступа RLS по Региону или Проекту.'
              : 'Kullanıcı hesapları oluşturun ve Bölge (Region) ya da Proje (Proje Adı) bazlı veri erişim yetkilerini (RLS) kural olarak bağlayın.'}
          </p>
        </div>

        <button
          onClick={() => {
            setShowAddModal(true);
            setFormError(null);
            setFormSuccess(null);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>{lang === 'ru' ? 'Создать пользователя' : 'Yeni Kullanıcı Tanımla'}</span>
        </button>
      </div>

      {/* RLS EXPLANATION CARD */}
      <div className="p-5 bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-slate-50 dark:to-slate-900 rounded-2xl border border-indigo-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {lang === 'ru' ? 'Как работает Row-Level Security (RLS)?' : 'Row-Level Security (RLS) Nasıl Çalışır?'}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
              {lang === 'ru' ? (
                <>
                  Когда пользователю назначен <strong>Регион (Казань и др.)</strong> или <strong>Проект (DGP-02 и др.)</strong>, при входе в систему Дашборд, Отчеты и Таблица персонала из 198 колонок отображают <strong>исключительно</strong> назначенные ему данные.
                  <strong>Администратор (Все)</strong> имеет неограниченный доступ ко всем проектам компании.
                </>
              ) : (
                <>
                  Bir kullanıcıya <strong>Bölge (Kazan vb.)</strong> veya <strong>Proje (DGP-02 vb.)</strong> atandığında, bu kullanıcı sisteme girdiğinde Dashboard, Raporlar ve 198 Kolonluk Personel Tablosu <strong>yalnızca</strong> kendisine atanan verileri görür.
                  <strong>Admin (Tümü)</strong> ise tüm şirket verilerine eksiksiz erişir.
                </>
              )}
            </p>
          </div>
        </div>

        {currentUser && (
          <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs text-xs shrink-0">
            <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium block">
              {lang === 'ru' ? 'Текущая сессия:' : 'Aktif Oturum:'}
            </span>
            <span className="font-bold text-slate-900 dark:text-white">{currentUser.name}</span>
            <span className="text-[10px] block font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5">
              {lang === 'ru' ? 'Область: ' : 'Kapsam: '}
              {currentUser.scope_type === 'all'
                ? lang === 'ru'
                  ? 'Все (Без ограничений)'
                  : 'Tümü (Sınırsız)'
                : `${currentUser.scope_type === 'region' ? (lang === 'ru' ? 'Регион' : 'Bölge') : (lang === 'ru' ? 'Проект' : 'Proje')}: ${currentUser.scope_value}`}
            </span>
          </div>
        )}
      </div>

      {/* USERS TABLE */}
      <div className="bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-500" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              {lang === 'ru' ? 'Пользователи и области доступа RLS' : 'Tanımlı Kullanıcılar & RLS Kapsamları'}
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
              {users.length} {lang === 'ru' ? 'пользователей' : 'Kullanıcı'}
            </span>
          </div>
          <span className="text-[11px] text-slate-600 dark:text-slate-400">
            {lang === 'ru' ? 'Переключайтесь в один клик для тестирования RLS' : "Tek tıkla kullanıcı değiştirip RLS'i test edebilirsiniz"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-slate-50/90 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">{lang === 'ru' ? 'Пользователь' : 'Kullanıcı'}</th>
                <th className="py-3 px-4">{lang === 'ru' ? 'E-Mail' : 'E-Posta'}</th>
                <th className="py-3 px-4">{lang === 'ru' ? 'Пароль' : 'Şifre'}</th>
                <th className="py-3 px-4">{lang === 'ru' ? 'Роль' : 'Rol'}</th>
                <th className="py-3 px-4">{lang === 'ru' ? 'Область доступа RLS' : 'RLS Erişim Kapsamı'}</th>
                <th className="py-3 px-4">{lang === 'ru' ? 'Дата регистрации' : 'Kayıt Tarihi'}</th>
                <th className="py-3 px-4 text-right">{lang === 'ru' ? 'Действия' : 'İşlemler'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => {
                const isCurrent = currentUser?.email === u.email;
                return (
                  <tr key={u.id} className={`hover:bg-slate-50/80 transition-colors ${isCurrent ? 'bg-indigo-50/40' : ''}`}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 font-bold text-xs flex items-center justify-center">
                          {u.name.slice(0, 1)}
                        </div>
                        <div>
                          <span className="font-bold text-slate-900 block">{u.name}</span>
                          {isCurrent && (
                            <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{' '}
                              {lang === 'ru' ? 'Активный аккаунт' : 'Aktif Hesap'}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700">{u.email}</td>
                    <td className="py-3 px-4 font-mono text-slate-600">••••••••</td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                          u.role === 'admin'
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {u.role === 'admin'
                          ? lang === 'ru'
                            ? '🛡️ Администратор'
                            : '🛡️ Admin'
                          : lang === 'ru'
                          ? '👤 Пользователь'
                          : '👤 Kullanıcı'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {u.scope_type === 'all' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[11px]">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                          {lang === 'ru' ? 'Все (Все участки и проекты)' : 'Tümü (Sınırsız Şantiye & Proje)'}
                        </span>
                      ) : u.scope_type === 'region' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold text-[11px]">
                          <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                          {lang === 'ru' ? 'Регион: ' : 'Bölge: '}
                          {u.scope_value}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[11px]">
                          <Briefcase className="w-3.5 h-3.5 text-amber-600" />
                          {lang === 'ru' ? 'Проект: ' : 'Proje: '}
                          {u.scope_value}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{u.created_at || '-'}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!isCurrent && (
                          <button
                            onClick={() => switchUser(u)}
                            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                            title={lang === 'ru' ? 'Войти под этим пользователем для проверки RLS' : "Bu kullanıcı olarak anında giriş yap ve RLS test et"}
                          >
                            <LogIn className="w-3 h-3" />
                            <span>{lang === 'ru' ? 'Войти' : 'Geçiş Yap'}</span>
                          </button>
                        )}
                        {u.id !== 1 && (
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title={lang === 'ru' ? 'Удалить пользователя' : 'Kullanıcıyı Sil'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD USER MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {lang === 'ru' ? 'Новый пользователь и RLS' : 'Yeni Kullanıcı & RLS Tanımla'}
                  </h2>
                  <p className="text-xs text-slate-600">
                    {lang === 'ru' ? 'Укажите ограничения по региону или проекту' : 'Bölge veya proje kısıtlaması belirleyin'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {lang === 'ru' ? 'ФИО' : 'Ad Soyad'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={lang === 'ru' ? 'напр.: Начальник участка Амур' : 'örn: Amur Şantiye Müdürü'}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {lang === 'ru' ? 'E-Mail адрес' : 'E-Posta Adresi'}
                </label>
                <input
                  type="email"
                  required
                  placeholder="amur@pondera.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {lang === 'ru' ? 'Пароль для входа' : 'Giriş Şifresi'}
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'ru' ? 'Системная роль' : 'Sistem Rolü'}
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => {
                      const newRole = e.target.value as 'admin' | 'user';
                      setFormData({
                        ...formData,
                        role: newRole,
                        scope_type: newRole === 'admin' ? 'all' : formData.scope_type,
                      });
                    }}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="user">{lang === 'ru' ? 'Стандартный пользователь' : 'Standart Kullanıcı'}</option>
                    <option value="admin">{lang === 'ru' ? 'Администратор' : 'Admin (Yönetici)'}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'ru' ? 'Область доступа (RLS)' : 'Erişim Kapsamı (RLS)'}
                  </label>
                  <select
                    value={formData.scope_type}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        scope_type: e.target.value as any,
                        scope_value:
                          e.target.value === 'region'
                            ? filterOptions.regions[0] || 'Kazan'
                            : e.target.value === 'project'
                            ? filterOptions.projects[0] || 'DGP-02'
                            : 'all',
                      })
                    }
                    disabled={formData.role === 'admin'}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50"
                  >
                    <option value="region">{lang === 'ru' ? 'По региону / участку' : 'Bölge / Şantiye Bazlı'}</option>
                    <option value="project">{lang === 'ru' ? 'По проекту' : 'Proje Bazlı'}</option>
                    <option value="all">{lang === 'ru' ? 'Все (Без ограничений)' : 'Tümü (Sınırsız)'}</option>
                  </select>
                </div>
              </div>

              {/* Scope Value Dropdown */}
              {formData.scope_type !== 'all' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {formData.scope_type === 'region'
                      ? lang === 'ru'
                        ? 'Назначаемый регион'
                        : 'Atanacak Bölge (Region)'
                      : lang === 'ru'
                      ? 'Назначаемый проект'
                      : 'Atanacak Proje'}
                  </label>
                  <select
                    value={formData.scope_value}
                    onChange={(e) => setFormData({ ...formData, scope_value: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-indigo-50/50 border border-indigo-200 rounded-xl font-bold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    {formData.scope_type === 'region'
                      ? filterOptions.regions.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))
                      : filterOptions.projects.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                  </select>
                  <p className="text-[11px] text-slate-600 mt-1">
                    {lang === 'ru'
                      ? `Этот пользователь сможет видеть данные только по: ${formData.scope_value}`
                      : `Bu kullanıcı yalnızca ${formData.scope_value} verilerini görebilecektir.`}
                  </p>
                </div>
              )}

              {/* Status alerts */}
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}
              {formSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{formSuccess}</span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  {lang === 'ru' ? 'Отмена' : 'İptal'}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs disabled:opacity-50"
                >
                  {submitting
                    ? lang === 'ru'
                      ? 'Сохранение...'
                      : 'Kaydediliyor...'
                    : lang === 'ru'
                    ? 'Создать пользователя'
                    : 'Kullanıcıyı Oluştur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
