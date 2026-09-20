import ChariowStatusNotice from "@/components/ChariowStatusNotice";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ChariowStatusNotice />
    </>
  );
}
