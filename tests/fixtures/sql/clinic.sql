-- Clinic demo schema (synthetic). A comment that names 'create procedure Ghost'.
create database ClinicDemo
GO
create table [dbo].[Visit]
(
    VisitId int primary key,
    Paid varchar(10), -- 'paid' or 'Paid' ) in a comment
    NotifyPatient bit,
    NotifyDoctor bit
)
GO
/* a block comment
   create procedure Ghost2 */
create view TopVisits
as
select top 20 VisitId from Visit order by VisitId desc
GO
CREATE PROC CloseVisit @VisitId int
as
begin
    update Visit set Paid = 'paid', NotifyPatient = 1, NotifyDoctor = 1 where VisitId = @VisitId
    create table #scratch (x int)
end

create trigger VisitAudit on Visit after update
as
begin
    set nocount on
end
GO
CREATE OR ALTER FUNCTION dbo.fnShort(@s varchar(50)) returns varchar(2)
as
begin
    return cast(@s as varchar(2))
end
