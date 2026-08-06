import { lazy } from 'react';
import Achievements from './pages/Achievements';
const AdminAchievements = lazy(() => import('./pages/AdminAchievements'));
const AdminActivity = lazy(() => import('./pages/AdminActivity'));
const AdminCases = lazy(() => import('./pages/AdminCases'));
const AdminContent = lazy(() => import('./pages/AdminContent'));
const AdminCouponStats = lazy(() => import('./pages/AdminCouponStats'));
const AdminCoupons = lazy(() => import('./pages/AdminCoupons'));
const AdminDailyCases = lazy(() => import('./pages/AdminDailyCases'));
const AdminImages = lazy(() => import('./pages/AdminImages'));
const AdminModules = lazy(() => import('./pages/AdminModules'));
const AdminPayments = lazy(() => import('./pages/AdminPayments'));
const AdminPhases = lazy(() => import('./pages/AdminPhases'));
const AdminNotifications = lazy(() => import('./pages/AdminNotifications'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
import AprendaECG from './pages/AprendaECG';
import CompleteProfile from './pages/CompleteProfile';
import ConteudoECG from './pages/ConteudoECG';
import DailyCase from './pages/DailyCase';
import Dashboard from './pages/Dashboard';
// TEMPORARIO: pagina de diagnostico da rolagem mobile. Registrada aqui, e nao
// como rota solta no App.jsx, porque precisa passar pelo Layout para conseguir
// medir o wrapper e o <main>. Nao e linkada de lugar nenhum. Apagar junto com
// src/pages/Diag.jsx quando o assunto fechar.
import Diag from './pages/Diag';
import Home from './pages/Home';
import ModuleDetail from './pages/ModuleDetail';
import Modules from './pages/Modules';
import Profile from './pages/Profile';
import Quiz from './pages/Quiz';
import Upgrade from './pages/Upgrade';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Achievements": Achievements,
    "AdminAchievements": AdminAchievements,
    "AdminActivity": AdminActivity,
    "AdminCases": AdminCases,
    "AdminContent": AdminContent,
    "AdminCouponStats": AdminCouponStats,
    "AdminCoupons": AdminCoupons,
    "AdminDailyCases": AdminDailyCases,
    "AdminImages": AdminImages,
    "AdminModules": AdminModules,
    "AdminPayments": AdminPayments,
    "AdminPhases": AdminPhases,
    "AdminNotifications": AdminNotifications,
    "AdminUsers": AdminUsers,
    "AprendaECG": AprendaECG,
    "CompleteProfile": CompleteProfile,
    "ConteudoECG": ConteudoECG,
    "DailyCase": DailyCase,
    "Dashboard": Dashboard,
    "Diag": Diag,
    "Home": Home,
    "ModuleDetail": ModuleDetail,
    "Modules": Modules,
    "Profile": Profile,
    "Quiz": Quiz,
    "Upgrade": Upgrade,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};