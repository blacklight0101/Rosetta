<%@ Page Language="C#" CodeBehind="Details.aspx.cs" Inherits="ShopWeb.Catalog.Details" %>
<html>
<body>
  <form runat="server">
    <asp:Label ID="NameLabel" runat="server" />
    <asp:Label ID="PriceLabel" runat="server" />
    <asp:TextBox ID="QuantityBox" runat="server" />
    <asp:RangeValidator ControlToValidate="QuantityBox" MinimumValue="1" MaximumValue="10" Type="Integer" runat="server" ErrorMessage="Quantity must be between 1 and 10." />
    <asp:Button ID="AddButton" Text="Add to basket" runat="server" OnClick="AddButton_Click" />
  </form>
</body>
</html>
