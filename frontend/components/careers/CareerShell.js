import CorporatePage from "@/components/public/CorporatePage";
import "./careers.css";

export default function CareerShell({ children }) {
  return (
    <CorporatePage wide className="career">
      {children}
    </CorporatePage>
  );
}
