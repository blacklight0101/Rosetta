<%@ Page Language="C#" CodeBehind="Default.aspx.cs" Inherits="ShopWeb.DefaultPage" %>
<html>
<body>
  <form runat="server">
    <asp:GridView ID="CatalogGrid" runat="server" OnRowCommand="CatalogGrid_RowCommand" />
    <asp:TextBox ID="SearchBox" runat="server" />
    <asp:Button ID="SearchButton" Text="Search" runat="server" OnClick="SearchButton_Click" />
  </form>
</body>
</html>
