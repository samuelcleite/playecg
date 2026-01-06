import Achievements from './pages/Achievements';
import AdminAchievements from './pages/AdminAchievements';
import AdminCases from './pages/AdminCases';
import AdminContent from './pages/AdminContent';
import AdminCouponStats from './pages/AdminCouponStats';
import AdminCoupons from './pages/AdminCoupons';
import AdminImages from './pages/AdminImages';
import AdminModules from './pages/AdminModules';
import AdminPayments from './pages/AdminPayments';
import AdminPhases from './pages/AdminPhases';
import AdminUsers from './pages/AdminUsers';
import CompleteProfile from './pages/CompleteProfile';
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';
import ModuleDetail from './pages/ModuleDetail';
import ModulePhases from './pages/ModulePhases';
import Modules from './pages/Modules';
import Profile from './pages/Profile';
import Quiz from './pages/Quiz';
import Upgrade from './pages/Upgrade';
import AprendaECG from './pages/AprendaECG';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Achievements": Achievements,
    "AdminAchievements": AdminAchievements,
    "AdminCases": AdminCases,
    "AdminContent": AdminContent,
    "AdminCouponStats": AdminCouponStats,
    "AdminCoupons": AdminCoupons,
    "AdminImages": AdminImages,
    "AdminModules": AdminModules,
    "AdminPayments": AdminPayments,
    "AdminPhases": AdminPhases,
    "AdminUsers": AdminUsers,
    "CompleteProfile": CompleteProfile,
    "Dashboard": Dashboard,
    "Home": Home,
    "ModuleDetail": ModuleDetail,
    "ModulePhases": ModulePhases,
    "Modules": Modules,
    "Profile": Profile,
    "Quiz": Quiz,
    "Upgrade": Upgrade,
    "AprendaECG": AprendaECG,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};