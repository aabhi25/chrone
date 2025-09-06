import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft,
  Users,
  MapPin,
  Clock,
  BookOpen,
  User,
  Calendar,
  GraduationCap,
  CalendarDays,
  Mail,
  Phone,
  IdCard,
  Plus,
  X,
  Download,
  FileSpreadsheet,
  Image,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { z } from "zod";
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';

interface Class {
  id: string;
  grade: string;
  section: string;
  studentCount: number;
  requiredSubjects: string[];
  schoolId: string;
  room?: string;
  createdAt: string;
  updatedAt: string;
}

interface Teacher {
  id: string;
  name: string;
  email?: string;
  contactNumber?: string;
  schoolIdNumber?: string;
  subjects?: string[];
  schoolId: string;
  isActive: boolean;
}

interface Subject {
  id: string;
  name: string;
  code: string;
  periodsPerWeek: number;
  color: string;
  schoolId: string;
}

interface TimetableEntry {
  id: string;
  classId: string;
  teacherId: string;
  subjectId: string;
  day: string;
  period: number;
  startTime: string;
  endTime: string;
  room?: string;
  teacher?: Teacher;
  subject?: {
    id: string;
    name: string;
    code: string;
  };
}

interface TimetableValidityPeriod {
  id: string;
  classId: string;
  validFrom: string;
  validTo: string;
  isActive: boolean;
}

interface ClassSubjectAssignment {
  id: string;
  classId: string;
  subjectId: string;
  weeklyFrequency: number;
  assignedTeacherId?: string | null;
  subject: Subject;
  assignedTeacher?: Teacher;
}

const teacherAssignmentSchema = z.object({
  teacherId: z.string().min(1, "Teacher is required"),
  subjectId: z.string().min(1, "Subject is required"),
});

const subjectAssignmentSchema = z.object({
  subjectId: z.string().min(1, "Subject is required"),
  weeklyFrequency: z.number().min(1, "Weekly frequency must be at least 1").max(8, "Weekly frequency cannot exceed 8 periods"),
});
type TeacherAssignmentFormData = z.infer<typeof teacherAssignmentSchema>;
type SubjectAssignmentFormData = z.infer<typeof subjectAssignmentSchema>;

export default function ClassDetailPage() {
  const [, params] = useRoute("/classes/:id");
  const { toast } = useToast();
  const { user } = useAuth();
  const classId = params?.id;
  const [isTeacherAssignDialogOpen, setIsTeacherAssignDialogOpen] = useState(false);
  const [isSubjectAssignDialogOpen, setIsSubjectAssignDialogOpen] = useState(false);
  const [isEditSubjectDialogOpen, setIsEditSubjectDialogOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<any>(null);
  
  const [isDeleteSubjectDialogOpen, setIsDeleteSubjectDialogOpen] = useState(false);
  const [subjectToDelete, setSubjectToDelete] = useState<any>(null);
  const [isDeleteTeacherDialogOpen, setIsDeleteTeacherDialogOpen] = useState(false);
  const [teacherToDelete, setTeacherToDelete] = useState<any>(null);


  const teacherAssignForm = useForm<TeacherAssignmentFormData>({
    resolver: zodResolver(teacherAssignmentSchema),
    defaultValues: {
      teacherId: "",
      subjectId: "",
    },
  });

  const subjectAssignForm = useForm<SubjectAssignmentFormData>({
    resolver: zodResolver(subjectAssignmentSchema),
    defaultValues: {
      subjectId: "",
      weeklyFrequency: 1,
    },
  });

  const editSubjectForm = useForm<{ weeklyFrequency: number }>({
    resolver: zodResolver(z.object({
      weeklyFrequency: z.number().min(1, "Weekly frequency must be at least 1").max(8, "Weekly frequency cannot exceed 8 periods")
    })),
    defaultValues: {
      weeklyFrequency: 1,
    },
  });

  // Class data query
  const {
    data: classData,
    isLoading: isClassLoading,
    error: classError,
  } = useQuery<Class>({
    queryKey: ["/api/classes", classId],
    enabled: !!classId,
  });

  // Timetable data query
  // Get current week dates for version queries
  const getCurrentWeek = () => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Monday
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 5); // Saturday
    
    return {
      start: startOfWeek.toISOString().split('T')[0],
      end: endOfWeek.toISOString().split('T')[0]
    };
  };

  const currentWeek = getCurrentWeek();


  const {
    data: timetableData = [],
    isLoading: isTimetableLoading,
  } = useQuery<TimetableEntry[]>({
    queryKey: ["/api/timetable/detailed", classId],
    queryFn: async () => {
      const params = new URLSearchParams({ classId: classId || '' });
      // Always fetch the latest active timetable - no version parameter
      const response = await apiRequest("GET", `/api/timetable/detailed?${params.toString()}`);
      return response.json() as Promise<TimetableEntry[]>;
    },
    enabled: !!classId,
  });

  // Validity periods query

  // Teachers query
  const {
    data: teachers = [],
    isLoading: isTeachersLoading,
  } = useQuery<Teacher[]>({
    queryKey: ["/api/teachers"],
  });

  // Subjects query
  const {
    data: subjects = [],
    isLoading: isSubjectsLoading,
  } = useQuery<Subject[]>({
    queryKey: ["/api/subjects"],
  });

  // Timetable structure query
  const { data: timetableStructure } = useQuery({
    queryKey: ["/api/timetable-structure"],
    enabled: !!user?.schoolId,
  });


  // Class Subject Assignments query
  const {
    data: classSubjectAssignments = [],
    isLoading: isAssignmentsLoading,
  } = useQuery<ClassSubjectAssignment[]>({
    queryKey: ["/api/class-subject-assignments", classId],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/class-subject-assignments?classId=${classId}`);
      return response.json() as Promise<ClassSubjectAssignment[]>;
    },
    enabled: !!classId,
  });


  const assignTeacherMutation = useMutation({
    mutationFn: async (data: TeacherAssignmentFormData) => {
      const response = await apiRequest("POST", `/api/classes/${classId}/assign-teacher`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/class-subject-assignments", classId] });
      setIsTeacherAssignDialogOpen(false);
      teacherAssignForm.reset();
      toast({
        title: "Success",
        description: "Teacher assigned successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to assign teacher",
        variant: "destructive",
      });
    },
  });

  const assignSubjectMutation = useMutation({
    mutationFn: async (data: SubjectAssignmentFormData) => {
      const response = await apiRequest("POST", "/api/class-subject-assignments", {
        ...data,
        classId
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/class-subject-assignments", classId] });
      setIsSubjectAssignDialogOpen(false);
      subjectAssignForm.reset();
      toast({
        title: "Success",
        description: "Subject assigned successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to assign subject",
        variant: "destructive",
      });
    },
  });

  const updateSubjectMutation = useMutation({
    mutationFn: async (data: { weeklyFrequency: number }) => {
      const response = await apiRequest("PUT", `/api/class-subject-assignments/${editingSubject?.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/class-subject-assignments"] });
      setIsEditSubjectDialogOpen(false);
      setEditingSubject(null);
      editSubjectForm.reset();
      toast({
        title: "Success",
        description: "Subject periods updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update subject periods",
        variant: "destructive",
      });
    },
  });

  const removeTeacherMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const response = await apiRequest("DELETE", `/api/classes/${classId}/unassign-teacher/${assignmentId}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/class-subject-assignments", classId] });
      toast({
        title: "Success",
        description: "Teacher assignment removed successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove teacher assignment",
        variant: "destructive",
      });
    },
  });

  const removeSubjectMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const response = await apiRequest("DELETE", `/api/class-subject-assignments/${assignmentId}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/class-subject-assignments", classId] });
      toast({
        title: "Success",
        description: "Subject assignment removed successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove subject assignment",
        variant: "destructive",
      });
    },
  });

  const generateTimetableMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/timetable/generate", {
        classId: classId
      });
      return response.json();
    },
    onSuccess: (result) => {
      if (result.success) {
        toast({
          title: "Success",
          description: result.message,
        });
        // Invalidate all timetable-related queries and force refetch
        queryClient.invalidateQueries({ 
          predicate: (query) => {
            const queryKey = query.queryKey;
            return queryKey[0] === "/api/timetable/detailed" || 
                   queryKey[0] === "/api/timetable";
          }
        });
        
        // Force refetch of the current timetable data
        queryClient.refetchQueries({ 
          predicate: (query) => {
            const queryKey = query.queryKey;
            return queryKey[0] === "/api/timetable/detailed";
          }
        });
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate timetable",
        variant: "destructive",
      });
    },
  });

  if (classError) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-destructive">Error loading class: {(classError as Error).message}</p>
            <Link href="/classes">
              <Button className="mt-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Classes
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!classId) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-destructive">Invalid class ID</p>
            <Link href="/classes">
              <Button className="mt-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Classes
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get teachers specifically assigned to this class through subject assignments
  const classTeachers = teachers.filter(teacher => 
    classSubjectAssignments.some(assignment => assignment.assignedTeacherId === teacher.id)
  );

  const uniqueSubjects = Array.from(new Set(timetableData.map(entry => entry.subject?.name).filter(Boolean)));

  // Get assigned subjects from class subject assignments
  const assignedSubjects = classSubjectAssignments;

  // Use timetable structure data or defaults
  const workingDays = (timetableStructure as any)?.workingDays || ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const timeSlots = (timetableStructure as any)?.timeSlots || [
    { period: 1, startTime: "08:00", endTime: "08:45" },
    { period: 2, startTime: "08:45", endTime: "09:30" },
    { period: 3, startTime: "09:30", endTime: "10:15" },
    { period: 4, startTime: "10:15", endTime: "11:00" },
    { period: 5, startTime: "11:15", endTime: "12:00" },
    { period: 6, startTime: "12:00", endTime: "12:45" },
    { period: 7, startTime: "12:45", endTime: "13:30" },
    { period: 8, startTime: "13:30", endTime: "14:15" },
  ];

  // Sort working days in proper order
  const sortWorkingDays = (days: string[]): string[] => {
    const dayOrder = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    return dayOrder.filter(day => days.includes(day));
  };

  const sortedWorkingDays = sortWorkingDays(workingDays);

  const getTimetableEntry = (day: string, period: number) => {
    return timetableData.find(entry => 
      entry.day === day.toLowerCase() && entry.period === period
    );
  };

  const formatTime12Hour = (time24: string): string => {
    const [hours, minutes] = time24.split(':');
    const hour24 = parseInt(hours, 10);
    const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
    const ampm = hour24 >= 12 ? 'PM' : 'AM';
    return `${hour12}:${minutes} ${ampm}`;
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

  // Get current week date range
  const getCurrentWeekRange = () => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Calculate offset to get to Monday
    
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    
    const saturday = new Date(monday);
    saturday.setDate(monday.getDate() + 5); // Saturday is 5 days after Monday
    
    return {
      start: monday,
      end: saturday
    };
  };

  const weekRange = getCurrentWeekRange();
  const formatDateRange = (start: Date, end: Date) => {
    const formatDate = (date: Date) => {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
      });
    };
    return `${formatDate(start)} - ${formatDate(end)}`;
  };

  // Export functions
  const exportToExcel = () => {
    if (!timetableData || timetableData.length === 0) {
      toast({
        title: "No Data",
        description: "No timetable data to export",
        variant: "destructive",
      });
      return;
    }

    // Create Excel workbook
    const wb = XLSX.utils.book_new();
    
    // Prepare data in grid format
    const headers = ['Period', ...sortedWorkingDays.map(day => day.charAt(0).toUpperCase() + day.slice(1))];
    
    const data: any[][] = [
      ['WEEKLY TIMETABLE'],
      ['Class: ' + (classData ? `${classData.grade}-${classData.section}` : '')],
      ['Period: ' + formatDateRange(weekRange.start, weekRange.end)],
      [], // Empty row
      headers
    ];

    // Fill in the timetable data
    timeSlots.forEach((timeSlot: any) => {
      if (timeSlot.isBreak) {
        const row = [`Break (${formatTime12Hour(timeSlot.startTime)} - ${formatTime12Hour(timeSlot.endTime)})`, 
                     ...Array(sortedWorkingDays.length).fill('Break Time')];
        data.push(row);
      } else {
        const row = [`P${timeSlot.period} (${formatTime12Hour(timeSlot.startTime)} - ${formatTime12Hour(timeSlot.endTime)})`];
        
        sortedWorkingDays.forEach(day => {
          const entry = getTimetableEntry(day, timeSlot.period);
          if (entry) {
            row.push(`${entry.subject?.name || 'Unknown'} - ${entry.teacher?.name || 'Unknown'}`);
          } else {
            row.push('Free Period');
          }
        });
        
        data.push(row);
      }
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    
    // Set column widths
    const colWidths = [
      { wch: 20 }, // Period column
      ...sortedWorkingDays.map(() => ({ wch: 15 })) // Day columns
    ];
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, 'Timetable');
    
    const fileName = `Timetable_${classData?.grade}-${classData?.section}_${formatDateRange(weekRange.start, weekRange.end).replace(/[^a-zA-Z0-9-]/g, '_')}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    toast({
      title: "Export Successful",
      description: "Timetable exported to Excel successfully",
    });
  };

  const exportToPNG = async () => {
    if (!timetableData || timetableData.length === 0) {
      toast({
        title: "No Data",
        description: "No timetable data to export",
        variant: "destructive",
      });
      return;
    }

    const timetableSection = document.getElementById('timetable-section');
    if (!timetableSection) {
      toast({
        title: "Export Error",
        description: "Could not find timetable to export",
        variant: "destructive",
      });
      return;
    }

    try {
      const canvas = await html2canvas(timetableSection, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
      });
      
      // Create download link
      const link = document.createElement('a');
      link.download = `Timetable_${classData?.grade}-${classData?.section}_${formatDateRange(weekRange.start, weekRange.end).replace(/[^a-zA-Z0-9-]/g, '_')}.png`;
      link.href = canvas.toDataURL();
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "Export Successful",
        description: "Timetable exported as PNG successfully",
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Error",
        description: "Failed to export timetable as PNG",
        variant: "destructive",
      });
    }
  };



  const handleAssignTeacher = (data: TeacherAssignmentFormData) => {
    assignTeacherMutation.mutate(data);
  };

  const handleAssignSubject = (data: SubjectAssignmentFormData) => {
    assignSubjectMutation.mutate(data);
  };

  const handleEditSubject = (assignment: any) => {
    setEditingSubject(assignment);
    editSubjectForm.setValue("weeklyFrequency", assignment.weeklyFrequency);
    setIsEditSubjectDialogOpen(true);
  };

  const handleUpdateSubject = (data: { weeklyFrequency: number }) => {
    updateSubjectMutation.mutate(data);
  };

  const handleDeleteSubjectClick = (assignment: any) => {
    setSubjectToDelete(assignment);
    setIsDeleteSubjectDialogOpen(true);
  };

  const handleConfirmDeleteSubject = () => {
    if (subjectToDelete) {
      removeSubjectMutation.mutate(subjectToDelete.id);
      setIsDeleteSubjectDialogOpen(false);
      setSubjectToDelete(null);
    }
  };

  const handleDeleteTeacherClick = (assignment: any) => {
    setTeacherToDelete(assignment);
    setIsDeleteTeacherDialogOpen(true);
  };

  const handleConfirmDeleteTeacher = () => {
    if (teacherToDelete) {
      removeTeacherMutation.mutate(teacherToDelete.id);
      setIsDeleteTeacherDialogOpen(false);
      setTeacherToDelete(null);
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/classes">
            <Button variant="outline" size="sm" data-testid="button-back-to-classes">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Classes
            </Button>
          </Link>
          <div>
            {isClassLoading ? (
              <Skeleton className="h-8 w-48" />
            ) : (
              <h1 className="text-3xl font-bold tracking-tight" data-testid="class-name">
                {classData?.section ? 
                  `Class ${classData.grade}${classData.section}` : 
                  `Grade ${classData?.grade}`
                }
              </h1>
            )}
            <p className="text-muted-foreground">
              Complete class overview with teachers and timetable
            </p>
          </div>
        </div>
      </div>


      {/* Class Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Students</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isClassLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="student-count">{classData?.studentCount || 0}</div>
            )}
            <p className="text-xs text-muted-foreground">Total enrolled</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Teachers</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isTeachersLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="teacher-count">{classTeachers.length}</div>
            )}
            <p className="text-xs text-muted-foreground">Assigned teachers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Subjects</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isTimetableLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="subject-count">{uniqueSubjects.length}</div>
            )}
            <p className="text-xs text-muted-foreground">Total subjects</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Room</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isClassLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="class-room">{classData?.room || "Not set"}</div>
            )}
            <p className="text-xs text-muted-foreground">Class location</p>
          </CardContent>
        </Card>
      </div>

      {/* Assigned Subjects */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <BookOpen className="h-5 w-5" />
              <span>Assigned Subjects</span>
            </CardTitle>
            <Dialog open={isSubjectAssignDialogOpen} onOpenChange={setIsSubjectAssignDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-assign-subject">
                  <Plus className="h-4 w-4 mr-2" />
                  Assign Subject
                </Button>
              </DialogTrigger>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isAssignmentsLoading ? (
            <div className="flex gap-2 flex-wrap">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-24" />
              ))}
            </div>
          ) : assignedSubjects.length === 0 ? (
            <div className="text-center py-8">
              <BookOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No subjects assigned</h3>
              <p className="text-muted-foreground">
                This class doesn't have any subjects assigned yet.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {assignedSubjects.map((assignment) => (
                <div key={assignment.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => handleEditSubject(assignment)}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-sm px-2 py-1" data-testid={`assigned-subject-${assignment.id}`}>
                        <span style={{ color: assignment.subject?.color || "#3B82F6" }}>{assignment.subject?.name || "Unknown Subject"}</span>
                        <span className="ml-1 text-muted-foreground">({assignment.subject?.code || "N/A"})</span>
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {assignment.weeklyFrequency} periods/week
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSubjectClick(assignment);
                    }}
                    disabled={removeSubjectMutation.isPending}
                    data-testid={`button-remove-subject-${assignment.id}`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Teachers Teaching This Class */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <User className="h-5 w-5" />
              <span>Teachers Teaching This Class</span>
            </CardTitle>
            <Dialog open={isTeacherAssignDialogOpen} onOpenChange={setIsTeacherAssignDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={assignedSubjects.length === 0}
                  data-testid="button-assign-teacher"
                  title={assignedSubjects.length === 0 ? "Please assign subjects to this class first" : "Assign Teacher"}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Assign Teacher
                </Button>
              </DialogTrigger>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isTeachersLoading ? (
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="p-3">
                  <Skeleton className="h-6 w-24 mb-2" />
                  <Skeleton className="h-4 w-32" />
                </Card>
              ))}
            </div>
          ) : classTeachers.length === 0 ? (
            <div className="text-center py-8">
              <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No teachers assigned</h3>
              <p className="text-muted-foreground">
                This class doesn't have any teachers assigned yet.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {classTeachers.map((teacher) => {
                const teacherAssignments = classSubjectAssignments.filter(assignment => assignment.assignedTeacherId === teacher.id);
                return (
                  <Card key={teacher.id} className="hover:shadow-md transition-shadow" data-testid={`class-teacher-card-${teacher.id}`}>
                    <CardHeader className="pb-2 pt-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 flex-1 min-w-0">
                          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                            <User className="h-4 w-4 text-primary-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm truncate" data-testid={`class-teacher-name-${teacher.id}`}>
                              {teacher.name}
                            </h3>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-1 pt-0 pb-3">
                    {teacher.email && (
                      <div className="flex items-center gap-1 text-xs">
                        <Mail className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        <span className="text-muted-foreground truncate" data-testid={`class-teacher-email-${teacher.id}`}>
                          {teacher.email}
                        </span>
                      </div>
                    )}

                    {teacher.schoolIdNumber && (
                      <div className="flex items-center gap-1 text-xs">
                        <IdCard className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        <span className="text-muted-foreground" data-testid={`class-teacher-school-id-${teacher.id}`}>
                          {teacher.schoolIdNumber}
                        </span>
                      </div>
                    )}

                    {teacherAssignments.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {teacherAssignments.map((assignment) => (
                          <Badge key={assignment.id} variant="secondary" className="text-xs flex items-center gap-1" data-testid={`teacher-subject-${teacher.id}-${assignment.subjectId}`}>
                            <span>{assignment.subject?.name} ({assignment.subject?.code})</span>
                            <button
                              onClick={() => handleDeleteTeacherClick(assignment)}
                              disabled={removeTeacherMutation.isPending}
                              className="hover:text-destructive transition-colors ml-1"
                              data-testid={`button-remove-subject-${teacher.id}-${assignment.subjectId}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Timetable Section */}
      <Card id="timetable-section">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-4">
                <div>
                  <CardTitle className="flex items-center space-x-2">
                    <Calendar className="h-5 w-5" />
                    <span>Weekly Timetable</span>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatDateRange(weekRange.start, weekRange.end)}
                  </p>
                </div>
                
              </div>
            </div>
            <div className="flex space-x-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    disabled={timetableData.length === 0}
                    data-testid="button-export-dropdown"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={exportToExcel} data-testid="export-excel">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Export to Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportToPNG} data-testid="export-png">
                    <Image className="h-4 w-4 mr-2" />
                    Export as PNG
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              <Button 
                onClick={() => generateTimetableMutation.mutate()}
                disabled={classSubjectAssignments.length === 0 || classTeachers.length === 0 || generateTimetableMutation.isPending}
                data-testid="button-refresh-timetable"
              >
                {generateTimetableMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <i className="fas fa-sync mr-2"></i>
                )}
                {generateTimetableMutation.isPending ? "Generating..." : "Refresh Table"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {classSubjectAssignments.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No subjects assigned</h3>
              <p className="text-muted-foreground">
                Please assign subjects to this class first before generating timetable.
              </p>
            </div>
          ) : classTeachers.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No teachers assigned</h3>
              <p className="text-muted-foreground">
                Please assign teachers to subjects before generating timetable.
              </p>
            </div>
          ) : isTimetableLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : timetableData.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No timetable found</h3>
              <p className="text-muted-foreground mb-4">
                Click "Refresh Table" to automatically generate timetable based on assigned subjects and teachers.
              </p>
              <Button 
                onClick={() => generateTimetableMutation.mutate()}
                disabled={generateTimetableMutation.isPending}
                data-testid="button-generate-timetable"
              >
                {generateTimetableMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <i className="fas fa-magic mr-2"></i>
                )}
                {generateTimetableMutation.isPending ? "Generating..." : "Generate Timetable"}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table id="timetable-grid" className="w-full border-collapse border border-border">
                <thead>
                  <tr>
                    <th className="border border-border p-3 bg-muted text-left font-medium">
                      <Clock className="h-4 w-4 inline mr-2" />
                      Time Period
                    </th>
                    {sortedWorkingDays.map(day => (
                      <th key={day} className="border border-border p-3 bg-muted text-center font-medium">
                        {day.charAt(0).toUpperCase() + day.slice(1)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeSlots.map((timeSlot: any) => (
                    <tr key={timeSlot.period} className={`border-b border-border ${timeSlot.isBreak ? 'bg-orange-50' : ''}`}>
                      <td className={`border border-border p-3 font-medium ${timeSlot.isBreak ? 'bg-orange-100 text-orange-800' : 'bg-muted/30'}`}>
                        {timeSlot.isBreak ? (
                          <div className="flex items-center space-x-2">
                            <i className="fas fa-coffee text-orange-600" />
                            <span className="text-sm">Break Time</span>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <Badge variant="outline" className="text-xs">
                              P{timeSlot.period}
                            </Badge>
                            <span className="text-sm">{formatTime12Hour(timeSlot.startTime)} - {formatTime12Hour(timeSlot.endTime)}</span>
                          </div>
                        )}
                      </td>
                      {timeSlot.isBreak ? (
                        <td colSpan={sortedWorkingDays.length} className="border border-border p-3 text-center bg-orange-50 font-medium text-orange-800">
                          <i className="fas fa-coffee mr-2"></i>
                          Break Time
                        </td>
                      ) : (
                        sortedWorkingDays.map(day => {
                          const entry = getTimetableEntry(day, timeSlot.period);
                          return (
                            <td key={day} className="border border-border p-3 text-center" data-testid={`timetable-${day}-${timeSlot.period}`}>
                              {entry ? (
                                <div className={`rounded-lg p-2 border ${getSubjectColor((entry.subject as any)?.color || '#3B82F6')}`}>
                                  <div className="font-medium text-sm">
                                    {entry.subject?.name || 'Unknown Subject'}
                                  </div>
                                  <div className="text-xs opacity-75">
                                    {entry.teacher?.name || 'Unknown Teacher'}
                                  </div>
                                  {entry.room && (
                                    <div className="text-xs opacity-75">Room: {entry.room}</div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-sm">Free Period</span>
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
        </CardContent>
      </Card>

      {/* Teacher Assignment Dialog */}
      <Dialog open={isTeacherAssignDialogOpen} onOpenChange={setIsTeacherAssignDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Assign Teacher to Class</DialogTitle>
            <DialogDescription>
              {assignedSubjects.length === 0 
                ? "Please assign subjects to this class first before assigning teachers"
                : "Select a teacher and subject to assign to this class"
              }
            </DialogDescription>
          </DialogHeader>
          <Form {...teacherAssignForm}>
            <form onSubmit={teacherAssignForm.handleSubmit(handleAssignTeacher)} className="space-y-4">
              <FormField
                control={teacherAssignForm.control}
                name="teacherId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teacher</FormLabel>
                    <Select onValueChange={(value) => {
                      field.onChange(value);
                      // Clear subject selection when teacher changes
                      teacherAssignForm.setValue("subjectId", "");
                    }} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-teacher">
                          <SelectValue placeholder="Select a teacher" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(() => {
                          const qualifiedTeachers = teachers.filter(teacher => {
                            // Only show teachers who can teach at least one subject assigned to this class
                            const classSubjectIds = assignedSubjects.map(assignment => assignment.subjectId);
                            return teacher.subjects && teacher.subjects.some(subjectId => 
                              classSubjectIds.includes(subjectId)
                            );
                          });

                          if (qualifiedTeachers.length === 0) {
                            return (
                              <div className="p-4 text-center text-muted-foreground">
                                <p className="text-sm">No qualified teachers available</p>
                                <p className="text-xs mt-1">
                                  Teachers must be assigned to at least one subject that this class studies
                                </p>
                              </div>
                            );
                          }

                          return qualifiedTeachers.map((teacher) => (
                            <SelectItem key={teacher.id} value={teacher.id}>
                              {teacher.name} ({teacher.email})
                            </SelectItem>
                          ));
                        })()}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={teacherAssignForm.control}
                name="subjectId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subject</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-subject">
                          <SelectValue placeholder="Select a subject" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(() => {
                          const selectedTeacherId = teacherAssignForm.watch("teacherId");
                          
                          if (!selectedTeacherId) {
                            return (
                              <div className="p-4 text-center text-muted-foreground">
                                <p className="text-sm">Please select a teacher first</p>
                              </div>
                            );
                          }

                          // Find the selected teacher
                          const selectedTeacher = teachers.find(t => t.id === selectedTeacherId);
                          
                          if (!selectedTeacher || !selectedTeacher.subjects) {
                            return (
                              <div className="p-4 text-center text-muted-foreground">
                                <p className="text-sm">Selected teacher has no subjects assigned</p>
                              </div>
                            );
                          }

                          // Filter assigned subjects to only show those the selected teacher can teach
                          const teacherQualifiedSubjects = assignedSubjects.filter(assignment => 
                            selectedTeacher.subjects.includes(assignment.subjectId)
                          );

                          if (teacherQualifiedSubjects.length === 0) {
                            return (
                              <div className="p-4 text-center text-muted-foreground">
                                <p className="text-sm">This teacher cannot teach any subjects assigned to this class</p>
                              </div>
                            );
                          }

                          return teacherQualifiedSubjects.map((assignment) => (
                            <SelectItem key={assignment.subjectId} value={assignment.subjectId}>
                              {assignment.subject.name} ({assignment.subject.code})
                            </SelectItem>
                          ));
                        })()}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button 
                  type="submit" 
                  disabled={assignTeacherMutation.isPending || assignedSubjects.length === 0}
                  data-testid="button-submit-teacher-assignment"
                >
                  {assignTeacherMutation.isPending ? "Assigning..." : "Assign Teacher"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Subject Assignment Dialog */}
      <Dialog open={isSubjectAssignDialogOpen} onOpenChange={setIsSubjectAssignDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Assign Subject to Class</DialogTitle>
            <DialogDescription>
              Select a subject to assign to this class
            </DialogDescription>
          </DialogHeader>
          <Form {...subjectAssignForm}>
            <form onSubmit={subjectAssignForm.handleSubmit(handleAssignSubject)} className="space-y-4">
              <FormField
                control={subjectAssignForm.control}
                name="subjectId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subject</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-subject-assignment">
                          <SelectValue placeholder="Select a subject" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(() => {
                          // Filter out subjects that are already assigned to this class
                          const assignedSubjectIds = assignedSubjects.map(assignment => assignment.subjectId);
                          const availableSubjects = subjects.filter(subject => 
                            !assignedSubjectIds.includes(subject.id)
                          );

                          if (availableSubjects.length === 0) {
                            return (
                              <div className="p-4 text-center text-muted-foreground">
                                <p className="text-sm">No subjects available to assign</p>
                                <p className="text-xs mt-1">
                                  All subjects have already been assigned to this class
                                </p>
                              </div>
                            );
                          }

                          return availableSubjects.map((subject) => (
                            <SelectItem key={subject.id} value={subject.id}>
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-3 h-3 rounded-full" 
                                  style={{ backgroundColor: subject.color }}
                                />
                                {subject.name} ({subject.code})
                              </div>
                            </SelectItem>
                          ));
                        })()}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={subjectAssignForm.control}
                name="weeklyFrequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Weekly Frequency (Periods per week)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        max="8"
                        placeholder="Enter number of periods per week"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                        data-testid="input-weekly-frequency"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button 
                  type="submit" 
                  disabled={assignSubjectMutation.isPending}
                  data-testid="button-submit-subject-assignment"
                >
                  {assignSubjectMutation.isPending ? "Assigning..." : "Assign Subject"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Subject Dialog */}
      <Dialog open={isEditSubjectDialogOpen} onOpenChange={setIsEditSubjectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Subject Periods</DialogTitle>
            <DialogDescription>
              Modify the weekly frequency for {editingSubject?.subject?.name} ({editingSubject?.subject?.code})
            </DialogDescription>
          </DialogHeader>
          <Form {...editSubjectForm}>
            <form onSubmit={editSubjectForm.handleSubmit(handleUpdateSubject)} className="space-y-4">
              <FormField
                control={editSubjectForm.control}
                name="weeklyFrequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Weekly Frequency (Periods per week)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        max="8"
                        placeholder="Enter number of periods per week"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                        data-testid="input-edit-weekly-frequency"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsEditSubjectDialogOpen(false);
                    setEditingSubject(null);
                    editSubjectForm.reset();
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={updateSubjectMutation.isPending}
                  data-testid="button-update-subject"
                >
                  {updateSubjectMutation.isPending ? "Updating..." : "Update Periods"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Subject Confirmation Dialog */}
      <AlertDialog open={isDeleteSubjectDialogOpen} onOpenChange={setIsDeleteSubjectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Subject Assignment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {subjectToDelete?.subject?.name} ({subjectToDelete?.subject?.code}) from this class? 
              This action cannot be undone and will remove all related timetable entries.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => {
                setIsDeleteSubjectDialogOpen(false);
                setSubjectToDelete(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteSubject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removeSubjectMutation.isPending}
              data-testid="button-confirm-delete-subject"
            >
              {removeSubjectMutation.isPending ? "Removing..." : "Remove Subject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Teacher Assignment Confirmation Dialog */}
      <AlertDialog open={isDeleteTeacherDialogOpen} onOpenChange={setIsDeleteTeacherDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Teacher Assignment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {teacherToDelete?.teacher?.name} from teaching {teacherToDelete?.subject?.name} ({teacherToDelete?.subject?.code}) for this class? 
              This action cannot be undone and will remove all related timetable entries.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => {
                setIsDeleteTeacherDialogOpen(false);
                setTeacherToDelete(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteTeacher}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removeTeacherMutation.isPending}
              data-testid="button-confirm-delete-teacher"
            >
              {removeTeacherMutation.isPending ? "Removing..." : "Remove Assignment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}