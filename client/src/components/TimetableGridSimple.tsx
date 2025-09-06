import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

interface TimetableEntry {
  id: string;
  day: string;
  period: number;
  startTime: string;
  endTime: string;
  teacherName?: string;
  subjectName?: string;
  className?: string;
  room?: string;
}

interface TimeSlot {
  period: number;
  startTime: string;
  endTime: string;
  isBreak?: boolean;
}

export default function TimetableGridSimple() {
  const { user } = useAuth();
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [viewMode, setViewMode] = useState<"class" | "teacher">("class");

  // Basic queries with no complex dependencies
  const classesQuery = useQuery({
    queryKey: ["/api/classes"],
  });

  const teachersQuery = useQuery({
    queryKey: ["/api/teachers"],
  });

  // Fetch timetable structure to get the correct time slots
  const structureQuery = useQuery({
    queryKey: ["/api/timetable-structure"],
  });


  const timetableQuery = useQuery({
    queryKey: ["/api/timetable/detailed", selectedClass, viewMode],
    queryFn: async () => {
      if (!selectedClass) return [];
      const params = new URLSearchParams();
      if (viewMode === "class") {
        params.append("classId", selectedClass);
        // Don't pass versionId - use the default active timetable for the class
      } else {
        params.append("teacherId", selectedClass);
      }
      // Add cache busting parameter to prevent HTTP 304 responses
      params.append("_t", Date.now().toString());
      const response = await apiRequest("GET", `/api/timetable/detailed?${params}`);
      return response.json();
    },
    enabled: !!selectedClass,
    staleTime: 0, // Always consider data stale to ensure fresh fetches
    gcTime: 0, // Don't cache the data at all (updated property name)
  });

  const isLoading = classesQuery.isLoading || teachersQuery.isLoading || structureQuery.isLoading;
  const rawClasses = classesQuery.data || [];
  const teachers = teachersQuery.data || [];
  
  // Sort classes properly: Class 1, Class 2, etc.
  const classes = [...rawClasses].sort((a, b) => {
    // Extract grade number from class name (e.g., "Class 3-A" -> 3, "Class 10" -> 10)
    const gradeA = parseInt(a.grade) || 0;
    const gradeB = parseInt(b.grade) || 0;
    
    if (gradeA !== gradeB) {
      return gradeA - gradeB;
    }
    
    // If grades are the same, sort by section (A, B, C, etc.)
    const sectionA = a.section || '';
    const sectionB = b.section || '';
    return sectionA.localeCompare(sectionB);
  });
  const timetableData = timetableQuery.data || [];


  const timetableStructure = structureQuery.data;

  // Use structure data or fallback to defaults - ensure proper day ordering
  const structureWorkingDays = timetableStructure?.workingDays || ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  
  // Ensure days are in proper order: Monday to Saturday
  const dayOrder = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const workingDays = dayOrder.filter(day => structureWorkingDays.includes(day));
  const timeSlots = timetableStructure?.timeSlots || [
    { period: 1, startTime: "08:00", endTime: "08:45" },
    { period: 2, startTime: "08:45", endTime: "09:30" },
    { period: 3, startTime: "09:30", endTime: "10:15" },
    { period: 4, startTime: "10:15", endTime: "11:00" },
    { period: 5, startTime: "11:15", endTime: "12:00" },
    { period: 6, startTime: "12:00", endTime: "12:45" },
    { period: 7, startTime: "12:45", endTime: "13:30" },
    { period: 8, startTime: "13:30", endTime: "14:15" },
  ];

  const getTimetableEntry = (day: string, period: number): TimetableEntry | null => {
    if (!timetableData || !Array.isArray(timetableData)) return null;
    return timetableData.find((entry: TimetableEntry) => 
      entry.day === day && entry.period === period
    ) || null;
  };

  const formatTime12Hour = (time24: string): string => {
    const [hours, minutes] = time24.split(':');
    const hour24 = parseInt(hours, 10);
    const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
    const ampm = hour24 >= 12 ? 'PM' : 'AM';
    return `${hour12}:${minutes} ${ampm}`;
  };

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  const selectOptions = viewMode === "class" ? classes : teachers;
  const selectPlaceholder = viewMode === "class" ? "Select a class" : "Select a teacher";

  return (
    <div className="bg-card rounded-lg border border-border">
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Weekly Timetable</h3>
          
          <div className="flex items-center space-x-3">
            <Select value={viewMode} onValueChange={(value: "class" | "teacher") => {
              setViewMode(value);
              setSelectedClass("");
            }}>
              <SelectTrigger className="w-32" data-testid="select-view-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="class">Class View</SelectItem>
                <SelectItem value="teacher">Teacher View</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedClass} onValueChange={(value) => {
              setSelectedClass(value);
            }}>
              <SelectTrigger className="w-48" data-testid="select-class-teacher">
                <SelectValue placeholder={selectPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {Array.isArray(selectOptions) && selectOptions.map((option: any) => (
                  <SelectItem key={option.id} value={option.id}>
                    {viewMode === "class" 
                      ? `Class ${option.grade}${option.section ? `-${option.section}` : ''}`
                      : option.name
                    }
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      
      <div className="p-6">
        {!selectedClass ? (
          <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/20">
            <p className="mb-2">Select a {viewMode} to view the timetable</p>
          </div>
        ) : timetableQuery.isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" data-testid="timetable-grid">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Time</th>
                  {workingDays.map(day => (
                    <th key={day} className="text-left py-3 px-4 font-medium text-muted-foreground">
                      {day.charAt(0).toUpperCase() + day.slice(1)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timeSlots.map((timeSlot: TimeSlot) => (
                  <tr key={timeSlot.period} className={`border-b border-border ${timeSlot.isBreak ? 'bg-orange-50' : ''}`}>
                    <td className={`py-4 px-4 font-medium text-sm ${timeSlot.isBreak ? 'bg-orange-100 text-orange-800' : 'bg-muted/50'}`}>
                      {formatTime12Hour(timeSlot.startTime)} - {formatTime12Hour(timeSlot.endTime)}
                    </td>
                    {timeSlot.isBreak ? (
                      <td colSpan={workingDays.length} className="py-4 px-4 text-center bg-orange-50 font-medium text-orange-800">
                        <i className="fas fa-coffee mr-2"></i>
                        Break Time
                      </td>
                    ) : (
                      workingDays.map(day => {
                        const entry = getTimetableEntry(day, timeSlot.period);
                        return (
                          <td key={day} className="py-4 px-4" data-testid={`cell-${day}-${timeSlot.period}`}>
                            {entry ? (
                              <div className="rounded-lg p-3 border bg-blue-50 border-blue-200">
                                <div className="font-medium text-sm text-blue-900">
                                  {entry.subject?.name || entry.subjectName || 'Subject'}
                                </div>
                                <div className="text-xs text-blue-700">
                                  {entry.teacher?.name || entry.teacherName || 'Teacher'}
                                  {entry.room && ` • Room ${entry.room}`}
                                </div>
                              </div>
                            ) : (
                              <div className="text-center text-muted-foreground text-sm">—</div>
                            )}
                          </td>
                        );
                      })
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}