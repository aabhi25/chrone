import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { School, Users, Activity, Shield, CheckCircle, XCircle, CalendarDays } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { getCurrentDateIST, formatDateIST } from "@shared/utils/dateUtils";
import { apiRequest } from "@/lib/queryClient";

interface AdminDashboardStats {
  totalSchools: number;
  activeSchools: number;
  inactiveSchools: number;
  schoolAdminLogins: Array<{
    schoolName: string;
    adminName: string;
    lastLogin: Date | null;
  }>;
  schoolTeacherCounts: Array<{
    schoolName: string;
    activeTeachers: number;
  }>;
}

interface SchoolInfo {
  id: string;
  name: string;
  address: string;
  contactPhone: string;
  adminName: string;
  isActive: boolean;
  totalTeachers: number;
}

interface TeacherAttendance {
  id: string;
  teacherId: string;
  date: string;
  status: "present" | "absent" | "sick_leave" | "personal_leave" | "medical_leave";
  leaveStartDate?: string;
  leaveEndDate?: string;
  reason?: string;
}

interface Teacher {
  id: string;
  name: string;
  email: string;
  subjects?: string[];
}

export default function Dashboard() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const isSchoolAdmin = user?.role === "admin";
  
  const { data: adminStats, isLoading: adminStatsLoading } = useQuery<AdminDashboardStats>({
    queryKey: ["/api/admin/dashboard-stats"],
    enabled: isSuperAdmin,
  });

  // Calculate today's date
  const today = getCurrentDateIST();

  const { data: schoolInfo, isLoading: schoolInfoLoading } = useQuery<SchoolInfo>({
    queryKey: ["/api/school-info"],
    enabled: isSchoolAdmin,
  });

  const { data: teachers = [] } = useQuery<Teacher[]>({
    queryKey: ["/api/teachers"],
    enabled: isSchoolAdmin,
  });

  const { data: timetableStructure } = useQuery({
    queryKey: ["/api/timetable-structure"],
    enabled: isSchoolAdmin,
  });

  const { data: todayAttendance = [] } = useQuery<TeacherAttendance[]>({
    queryKey: ["/api/teacher-attendance", today],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/teacher-attendance?date=${today}`);
      return response.json() as Promise<TeacherAttendance[]>;
    },
    enabled: isSchoolAdmin,
  });
  
  // Check if today is an active school day
  const todayDayName = format(new Date(), 'EEEE').toLowerCase(); // Gets day name like 'monday'
  const isActiveDay = timetableStructure?.workingDays?.includes(todayDayName) || false;

  // Use the same logic as TeacherView - check each teacher's status
  const getTeacherAttendanceStatus = (teacherId: string) => {
    // Only calculate attendance for active days
    if (!isActiveDay) return "not_applicable";
    
    const attendance = todayAttendance.find(
      (att) => att.teacherId === teacherId
    );
    return attendance?.status || "present";
  };

  // Calculate attendance counts only for active days
  const presentTeachers = isActiveDay ? teachers.filter(teacher => getTeacherAttendanceStatus(teacher.id) === "present") : [];
  const absentTeachers = isActiveDay ? teachers.filter(teacher => getTeacherAttendanceStatus(teacher.id) === "absent") : [];
  const onLeaveTeachers = isActiveDay ? teachers.filter(teacher => {
    const status = getTeacherAttendanceStatus(teacher.id);
    return status !== "present" && status !== "absent";
  }) : [];
  
  // Count teachers with no attendance marked today
  const teachersWithAttendance = new Set(todayAttendance.map(r => r.teacherId));
  const teachersWithoutAttendance = teachers.filter(t => !teachersWithAttendance.has(t.id));

  // Get teachers currently on leave with date ranges
  const teachersOnLeave = todayAttendance.filter(record => 
    record.status !== "present" && record.leaveStartDate && record.leaveEndDate &&
    record.leaveStartDate <= today && today <= record.leaveEndDate
  ).reduce((acc: Array<{
    teacherId: string;
    teacherName: string;
    startDate: string;
    endDate: string;
    status: string;
    reason?: string;
  }>, record) => {
    const teacher = teachers.find(t => t.id === record.teacherId);
    if (teacher && !acc.find(t => t.teacherId === record.teacherId)) {
      acc.push({
        teacherId: record.teacherId,
        teacherName: teacher.name,
        startDate: record.leaveStartDate!,
        endDate: record.leaveEndDate!,
        status: record.status,
        reason: record.reason
      });
    }
    return acc;
  }, []);

  return (
    <div>
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-3">
              <Shield className="h-8 w-8 text-primary" />
              <div>
                <h2 className="text-2xl font-semibold">
                  {isSuperAdmin ? "Super Admin Dashboard" : "School Admin Dashboard"}
                </h2>
                <p className="text-muted-foreground">
                  {isSuperAdmin ? "School Management Overview" : schoolInfo?.name || "School Management"}
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <span className="text-primary-foreground text-sm font-medium">{user?.firstName?.[0]}{user?.lastName?.[0]}</span>
            </div>
            <div>
              <p className="text-sm font-medium">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-muted-foreground capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
          </div>
        </div>
      </header>
      
      {/* Content */}
      <div className="p-6 overflow-y-auto h-full">
        {isSuperAdmin ? (
          <>
            {/* Super Admin Content */}
            {/* School Overview Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {adminStatsLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))
          ) : (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Schools</CardTitle>
                  <School className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{adminStats?.totalSchools ?? 0}</div>
                  <p className="text-xs text-muted-foreground">Schools registered</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Schools</CardTitle>
                  <Activity className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{adminStats?.activeSchools ?? 0}</div>
                  <p className="text-xs text-muted-foreground">Currently operational</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Inactive Schools</CardTitle>
                  <Users className="h-4 w-4 text-orange-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">{adminStats?.inactiveSchools ?? 0}</div>
                  <p className="text-xs text-muted-foreground">Need attention</p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
        
        {/* School Admin Activity & Teacher Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* School Admin Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5" />
                <span>School Admin Activity</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {adminStatsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12" />
                  ))}
                </div>
              ) : (
                <div className="space-y-4" data-testid="admin-activity-list">
                  {adminStats?.schoolAdminLogins?.map((admin, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{admin.schoolName}</p>
                        <p className="text-xs text-muted-foreground">{admin.adminName}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          {admin.lastLogin 
                            ? formatDistanceToNow(new Date(admin.lastLogin), { addSuffix: true })
                            : 'Never'
                          }
                        </p>
                      </div>
                    </div>
                  )) || (
                    <p className="text-sm text-muted-foreground">No school admins found</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Teacher Counts by School */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <School className="h-5 w-5" />
                <span>Active Teachers by School</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {adminStatsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12" />
                  ))}
                </div>
              ) : (
                <div className="space-y-4" data-testid="teacher-counts-list">
                  {adminStats?.schoolTeacherCounts?.map((school, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{school.schoolName}</p>
                      </div>
                      <div className="text-right">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          {school.activeTeachers} teachers
                        </span>
                      </div>
                    </div>
                  )) || (
                    <p className="text-sm text-muted-foreground">No schools found</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
            </div>
          </>
        ) : (
          <>
            {/* School Admin Content */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">School Information</CardTitle>
                  <School className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {schoolInfoLoading ? (
                    <Skeleton className="h-16" />
                  ) : (
                    <div>
                      <div className="text-2xl font-bold">{schoolInfo?.name}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Address: {schoolInfo?.address || "Not provided"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Contact: {schoolInfo?.contactPhone}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Teachers</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {schoolInfoLoading ? (
                    <Skeleton className="h-16" />
                  ) : (
                    <div>
                      <div className="text-2xl font-bold">{schoolInfo?.totalTeachers || 0}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Registered teachers in the system
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">Welcome!</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Manage your school's timetables, teachers, and more
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Present Teachers</CardTitle>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {isActiveDay ? presentTeachers.length : "—"}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {isActiveDay 
                      ? `Present today (${formatDateIST(today, { month: 'short', day: 'numeric' })})`
                      : "Not a school day"
                    }
                  </p>
                  {isActiveDay && teachersWithoutAttendance.length > 0 && (
                    <p className="text-xs text-yellow-600 mt-1">
                      {teachersWithoutAttendance.length} unmarked (defaulted to present)
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Absent Teachers</CardTitle>
                  <XCircle className="h-4 w-4 text-red-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">
                    {isActiveDay ? absentTeachers.length : "—"}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {isActiveDay ? "Marked absent today" : "Not a school day"}
                  </p>
                  {isActiveDay && onLeaveTeachers.length > 0 && (
                    <p className="text-xs text-orange-600 mt-1">
                      {onLeaveTeachers.length} on various leaves
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Teachers on Leave</CardTitle>
                  <CalendarDays className="h-4 w-4 text-orange-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">{teachersOnLeave.length}</div>
                  {teachersOnLeave.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {teachersOnLeave.slice(0, 2).map((teacher, index) => (
                        <div key={index} className="text-xs">
                          <div className="font-medium truncate">{teacher.teacherName}</div>
                          <div className="text-muted-foreground">
                            {formatDateIST(teacher.startDate, { month: 'short', day: 'numeric' })} - {formatDateIST(teacher.endDate, { month: 'short', day: 'numeric' })}
                          </div>
                        </div>
                      ))}
                      {teachersOnLeave.length > 2 && (
                        <div className="text-xs text-muted-foreground">
                          +{teachersOnLeave.length - 2} more
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">
                      {isActiveDay ? "No teachers on leave" : "School is closed today"}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
