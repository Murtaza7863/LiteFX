import { appBase } from "../lib/urls";
import { ClaimLinkModal } from "./ClaimLinkModal";

export function ClaimPage({ token }: { token: string }) {
  return (
    <ClaimLinkModal
      token={token}
      onClose={() => {
        window.location.assign(appBase() || "/");
      }}
      onClaimed={() => {}}
    />
  );
}
