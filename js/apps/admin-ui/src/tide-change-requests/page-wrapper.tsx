import { Suspense } from "react";
import ChangeRequestPage from "./ChangeRequestPage";

export default function PageWrapper() {
  return (
    <Suspense fallback={null}>
      <ChangeRequestPage />
    </Suspense>
  );
}
