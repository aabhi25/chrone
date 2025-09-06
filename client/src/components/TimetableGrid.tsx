import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import React from "react";

interface TimetableEntry {
  id: string;
  day: string;
  period: number;
  startTime: string;
  endTime: string;
  teacher: {
    name: string;
  };
  subject: {
    name: string;
    color: string;
  };
  class: {
    grade: string;
    section: string;
  };
  room?: string;
}

interface TimeSlot {
  period: number;
  startTime: string;
  endTime: string;
  isBreak?: boolean;
}

interface TimetableStructure {
  id: string;
  schoolId: string;
  periodsPerDay: number;
  workingDays: string[];
  timeSlots: TimeSlot[];
  isActive: boolean;
}

// Function to sort working days in proper order
const sortWorkingDays = (days: string[]): string[] => {
  const dayOrder = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return dayOrder.filter(day => days.includes(day));
};

// Format time to 12-hour format with AM/PM
const formatTime12Hour = (time24: string): string => {
  const [hours, minutes] = time24.split(':');
  const hour24 = parseInt(hours, 10);
  const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  return `${hour12}:${minutes} ${ampm}`;
};

export default function TimetableGrid() {
  const { user } = useAuth();
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [viewMode, setViewMode] = useState<"class" | "teacher">("class");

  const { data: classes, isLoading: classesLoading } = useQuery({
    queryKey: ["/api/classes"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const { data: teachers, isLoading: teachersLoading } = useQuery({
    queryKey: ["/api/teachers"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch timetable structure
  const { data: timetableStructure, isLoading: structureLoading } = useQuery<TimetableStructure>({
    queryKey: ["/api/timetable-structure"],
    staleTime: 10 * 60 * 1000, // 10 minutes
  });


  const shouldFetchTimetable = Boolean(selectedClass);
  const { data: timetableData, isLoading: timetableLoading } = useQuery<TimetableEntry[]>({
    queryKey: ["/api/timetable/detailed", selectedClass, viewMode],
    queryFn: async () => {
      if (!shouldFetchTimetable) return [];
      const params = new URLSearchParams();
      if (viewMode === "class" && selectedClass) {
        params.append("classId", selectedClass);
        // Always fetch the latest active timetable - no version parameter
      } else if (viewMode === "teacher" && selectedClass) {
        params.append("teacherId", selectedClass);
      }
      const response = await fetch(`/api/timetable/detailed?${params}`);
      return response.json();
    },
    enabled: shouldFetchTimetable,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  const getTimetableEntry = (day: string, period: number): TimetableEntry | null => {
    if (!timetableData || !Array.isArray(timetableData)) return null;
    return timetableData.find((entry: TimetableEntry) => 
      entry.day === day && entry.period === period
    ) || null;
  };

  const getSubjectColor = (color: string) => {
    const colorMap: Record<string, string> = {
      '#3B82F6': 'bg-blue-50 border-blue-200 text-blue-900',
      '#10B981': 'bg-green-50 border-green-200 text-green-900',
      '#8B5CF6': 'bg-purple-50 border-purple-200 text-purple-900',
      '#F59E0B': 'bg-orange-50 border-orange-200 text-orange-900',
      '#EF4444': 'bg-red-50 border-red-200 text-red-900',
      '#06B6D4': 'bg-cyan-50 border-cyan-200 text-cyan-900',
      '#EC4899': 'bg-pink-50 border-pink-200 text-pink-900',
      '#84CC16': 'bg-lime-50 border-lime-200 text-lime-900',
    };
    return colorMap[color] || 'bg-gray-50 border-gray-200 text-gray-900';
  };

  if (classesLoading || teachersLoading || structureLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  // Use structure data or fallback to defaults
  const workingDays = timetableStructure?.workingDays || ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
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
  
  const sortedDays = sortWorkingDays(workingDays);

  const selectOptions = viewMode === "class" ? classes : teachers;
  const selectPlaceholder = viewMode === "class" ? "Select a class" : "Select a teacher";

  // Get current week dates for display
  const getCurrentWeek = () => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Monday
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 5); // Saturday
    
    return {
      start: startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      end: endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    };
  };

  const currentWeek = getCurrentWeek();

  // Set active version when versions are loaded

  return (
    <div className="bg-card rounded-lg border border-border">
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-4">
              <div>
                <h3 className="text-lg font-semibold">Weekly Timetable</h3>
                <p className="text-muted-foreground text-sm">
                  {currentWeek.start} - {currentWeek.end}
                </p>
              </div>
              
            </div>
          </div>
          
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

            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger className="w-48" data-testid="select-class-teacher">
                <SelectValue placeholder={selectPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {Array.isArray(selectOptions) && selectOptions.map((option: any) => (
                  <SelectItem key={option.id} value={option.id}>
                    {viewMode === "class" 
                      ? `${option.grade}-${option.section}`
                      : option.name
                    }
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button variant="outline" data-testid="button-print-timetable">
              <i className="fas fa-print mr-2"></i>
              Print
            </Button>
            
            <Button data-testid="button-edit-timetable">
              <i className="fas fa-edit mr-2"></i>
              Edit
            </Button>
            
            {selectedClass && (
              <Button variant="default" data-testid="button-generate-timetable">
                <i className="fas fa-sync mr-2"></i>
                Generate Timetable
              </Button>
            )}
          </div>
        </div>
      </div>
      
      <div className="p-6">
        {!selectedClass ? (
          <div className="space-y-8">
            {/* Default Layout */}
            <div>
              <h4 className="text-lg font-semibold mb-4 flex items-center">
                <i className="fas fa-calendar-alt mr-2"></i>
                Weekly Timetable
              </h4>
              <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/20">
                <i className="fas fa-calendar-alt text-4xl mb-4"></i>
                <p className="mb-2">Select a {viewMode} to view the timetable layout</p>
                <p className="text-sm">Based on your configured time structure with {timeSlots.length} periods and {sortedDays.length} working days</p>
              </div>
            </div>

            {/* Timetable Generation Info */}
            <div>
              <h4 className="text-lg font-semibold mb-4 flex items-center">
                <i className="fas fa-cogs mr-2"></i>
                Timetable Generation
              </h4>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-blue-800 mb-3">
                  Generate an automated timetable based on assigned subjects and teacher availability.
                </p>
                <p className="text-blue-600 text-sm mb-4">
                  3 subjects assigned with weekly frequency requirements.
                </p>
                <Button variant="default" size="lg" data-testid="button-generate-all-timetables">
                  <i className="fas fa-magic mr-2"></i>
                  Generate Timetable
                </Button>
              </div>
            </div>
          </div>
        ) : timetableLoading ? (
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
                  {sortedDays.map(day => (
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
                      <td colSpan={sortedDays.length} className="py-4 px-4 text-center bg-orange-50 font-medium text-orange-800">
                        <i className="fas fa-coffee mr-2"></i>
                        Break Time
                      </td>
                    ) : (
                      sortedDays.map(day => {
                        const entry = getTimetableEntry(day, timeSlot.period);
                        return (
                          <td key={day} className="py-4 px-4" data-testid={`cell-${day}-${timeSlot.period}`}>
                            {entry ? (
                              <div className={`rounded-lg p-3 border ${getSubjectColor(entry.subject.color)}`}>
                                <div className="font-medium text-sm">{entry.subject.name}</div>
                                <div className="text-xs opacity-75">
                                  {viewMode === "class" ? entry.teacher.name : `${entry.class.grade}-${entry.class.section}`}
                                </div>
                                {entry.room && (
                                  <div className="text-xs opacity-75">{entry.room}</div>
                                )}
                              </div>
                            ) : (
                              <div className="h-12 flex items-center justify-center text-muted-foreground text-sm">
                                Free Period
                              </div>
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
        
        {selectedClass && timetableData && (
          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              <span className="flex items-center">
                <i className="fas fa-info-circle mr-2"></i>
                {timetableData.length} periods scheduled
              </span>
            </div>
            
            <div className="flex space-x-2">
              <Button variant="destructive" size="sm" data-testid="button-report-issue">
                <i className="fas fa-flag mr-2"></i>
                Report Issue
              </Button>
              
              <Button variant="outline" size="sm" data-testid="button-regenerate">
                <i className="fas fa-sync mr-2"></i>
                Regenerate
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
