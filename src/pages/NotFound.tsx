import { PageHead } from "../components/PageHead";
import { DataState } from "../components/primitives";
import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div>
      <PageHead kicker="SYSTEM" title="Route Not Found" />
      <DataState
        icon="alert"
        title="PAGE NOT FOUND"
        desc="The requested route does not exist in the VARUN-X application."
        action={
          <Link className="btn btn-primary" to="/">
            Return to Overview
          </Link>
        }
      />
    </div>
  );
}