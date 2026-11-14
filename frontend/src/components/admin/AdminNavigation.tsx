import { NavLink } from "react-router-dom";
import DesignIcon from "./DesignIcon";

export default function AdminNavigation() {
  return <nav className="admin-navigation" aria-label="Administracja">
    <NavLink to="/admin" end><DesignIcon name="Users" />Użytkownicy</NavLink>
    <NavLink to="/admin/reviews"><DesignIcon name="ShieldCheck" />Recenzje</NavLink>
  </nav>;
}
