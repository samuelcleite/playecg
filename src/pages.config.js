import Dashboard from './pages/Dashboard';
import Quiz from './pages/Quiz';
import Modules from './pages/Modules';
import ModuleDetail from './pages/ModuleDetail';
import Profile from './pages/Profile';
import Upgrade from './pages/Upgrade';
import AdminCases from './pages/AdminCases';
import AdminModules from './pages/AdminModules';
import AdminPhases from './pages/AdminPhases';
import AdminImages from './pages/AdminImages';
import CompleteProfile from './pages/CompleteProfile';
import AdminCoupons from './pages/AdminCoupons';
import AdminCouponStats from './pages/AdminCouponStats';
import ModulePhases from './pages/ModulePhases';
import AdminPayments from './pages/AdminPayments';
import AdminUsers from './pages/AdminUsers';
import AdminAchievements from './pages/AdminAchievements';
import Achievements from './pages/Achievements';
import AdminContent from './pages/AdminContent';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "Quiz": Quiz,
    "Modules": Modules,
    "ModuleDetail": ModuleDetail,
    "Profile": Profile,
    "Upgrade": Upgrade,
    "AdminCases": AdminCases,
    "AdminModules": AdminModules,
    "AdminPhases": AdminPhases,
    "AdminImages": AdminImages,
    "CompleteProfile": CompleteProfile,
    "AdminCoupons": AdminCoupons,
    "AdminCouponStats": AdminCouponStats,
    "ModulePhases": ModulePhases,
    "AdminPayments": AdminPayments,
    "AdminUsers": AdminUsers,
    "AdminAchievements": AdminAchievements,
    "Achievements": Achievements,
    "AdminContent": AdminContent,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};