import TimetableGridSimple from "@/components/TimetableGridSimple";

export default function TimetableView() {
  return (
    <div>
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Timetable Management</h2>
            <p className="text-muted-foreground">View and manage school timetables</p>
          </div>
        </div>
      </header>
      
      {/* Content */}
      <div className="p-6">
        <TimetableGridSimple />
      </div>
    </div>
  );
}
